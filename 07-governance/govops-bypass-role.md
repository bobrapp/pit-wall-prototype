# GovOps Gate Guardian Role and Gate Override Token Operating Procedure

**Version:** 1.0
**Status:** Draft — Pending VP NAMA and GovOps Lead Review
**Author:** [AI GovOps Lead — placeholder for sign-off]
**Last Updated:** 2026-05-27
**Classification:** Internal

---

## 1. Overview

### 1.1 Problem Statement

The Pit Wall v4.0 Gate 3 commit workflow includes an automatic Second Opinion (SO) agent check. When the SO agent returns an MDS (Model Divergence Score) at or above the configured threshold (default: 0.65), the Gate 3 commit is blocked pending analyst resolution. This safeguard is intentional — it prevents confident but miscalibrated forecasts from advancing to production.

However, the SO agent is a fallible component. It can produce false positives due to:
- SO agent calibration drift (miscalibrated MDS scoring after model update or data distribution shift)
- Stale signal contamination (a stalled tariff feed, an offline dealer data source, or a corrupted macro factor inflating MDS)
- LLM provider degradation (Anthropic API experiencing elevated latency, timeout rates, or quality regression)
- Infrastructure failure (SO service unreachable; MDS defaults to the block-safe value)

In any of these scenarios, a legitimate, well-reasoned Gate 3 commit for a high-stakes nameplate — potentially a production commitment affecting hundreds of millions of dollars in manufacturing allocation — can be blocked with no available override path. No VP of NAMA will sign off on a hard gate without a documented escalation and override mechanism.

This document defines the **GovOps Gate Guardian role**, the **Gate Override Token (GOT)** mechanism, and the full operating procedure for issuing and consuming GOTs.

### 1.2 Design Principles

1. **Override is possible but never invisible.** Every override is logged to HIBT before it takes effect. There is no silent bypass path.
2. **Override is scoped and time-limited.** A GOT unlocks one specific `forecast_id` for one 4-hour window. It cannot be used to bulk-unlock, modify scores, or alter the HIBT record.
3. **Override is subject to post-incident review.** GOT issuance for reason codes GOT-01, GOT-02, and GOT-04 requires a post-incident review within 48 hours.
4. **Anti-abuse controls prevent routine overriding.** GOT frequency limits and dual-authorization requirements for high-volume overrides prevent the mechanism from becoming a routine bypass.

---

## 2. Role Definition: GovOps Gate Guardian

### 2.1 Who Holds the Role

| Position | Person | Designation |
|---|---|---|
| Primary Gate Guardian | AI GovOps Lead (e.g., Don S.) | Primary — all GOT issuance authority |
| Designated Backup | Named by GovOps Lead prior to any planned absence | Backup — full authority when Primary is unavailable |

The Backup designation is documented in the GovOps team roster in the Pit Wall admin console. Only one Backup may be active at a time. Backup designation changes are logged to HIBT as `GOVOPS_ROLE_ASSIGNMENT_CHANGE` events.

### 2.2 What the Role Grants

- Ability to issue a Gate Override Token (GOT) that unblocks a single Gate 3 commit for a specific `forecast_id`
- Access to the GovOps console GOT issuance UI (in the Replit engineering app)
- Visibility into the real-time SO agent health dashboard (MDS distribution, latency, calibration drift indicators)
- Ability to trigger a manual SO calibration review

### 2.3 What the Role Does NOT Grant

The GovOps Gate Guardian role **explicitly does not** grant:

- Ability to modify, delete, or annotate any HIBT record
- Ability to change DQ weight configurations or scoring model parameters
- Ability to dismiss, suppress, or alter a Second Opinion result
- Ability to issue a GOT that covers multiple `forecast_id` values (bulk override is prohibited)
- Ability to unilaterally authorize a Gate 3 commit for Tier 4 / MNPI-flagged forecasts without VP NAMA authorization
- Ability to modify the MDS threshold or other gate configuration parameters

### 2.4 Role Activation and Deactivation

The role is active continuously (not on-call only). The Gate Guardian is expected to be reachable during standard business hours and accessible via GovOps on-call rotation outside business hours. On-call rotation is defined in the GovOps runbook (separate document).

---

## 3. Gate Override Token (GOT) Design

### 3.1 Token Structure

A GOT is a signed JSON Web Token (JWT) with the following claims:

```json
{
  "iss": "pit-wall-govops-svc",
  "iat": 1748390400,
  "exp": 1748404800,
  "jti": "<uuid-v4>",
  "forecast_id": "<uuid>",
  "analyst_id": "<analyst_sso_sub>",
  "gate_stage": "GATE_3",
  "reason_code": "GOT-01",
  "issued_by": "<govops_operator_sso_sub>",
  "expires_at": "2026-05-27T20:00:00Z",
  "hibt_ref": "<hibt_event_id_of_GATE_OVERRIDE_ISSUED>"
}
```

**Signing:** GOTs are signed with an RS256 private key held exclusively by `govops-svc`. The corresponding public key is registered with `gate-svc` for validation. Key rotation follows the standard 90-day certificate rotation cycle.

**`hibt_ref`:** The GOT includes a reference to the HIBT event that logged its issuance. This creates a tamper-evident chain: the GOT cannot be presented without a corresponding HIBT entry that pre-dates it.

### 3.2 GOT Lifecycle Events

All GOT lifecycle events are written to HIBT before the corresponding action takes effect.

| Event Type | Trigger | HIBT Written Before or After |
|---|---|---|
| `GATE_OVERRIDE_ISSUED` | GovOps operator issues GOT via console | BEFORE GOT is delivered to analyst — issuance is only valid if HIBT write succeeds |
| `GATE_OVERRIDE_CONSUMED` | Analyst calls `POST /forecasts/:id/gate-override` with valid GOT | Written at consumption time; Gate 3 commit proceeds only after HIBT write confirms |
| `GATE_OVERRIDE_EXPIRED` | GOT passes `exp` time without being consumed | Written by `govops-svc` expiry job (runs every 5 minutes) |
| `GATE_OVERRIDE_REJECTED` | GOT presented with invalid signature, wrong `forecast_id`, or already consumed | Written at rejection time; analyst notified |

### 3.3 API Endpoints

**Consume a GOT:**
```
POST /forecasts/:forecast_id/gate-override
Authorization: Bearer <analyst_jwt>
Content-Type: application/json

{
  "gate_override_token": "<got_jwt>"
}
```

Response on success: `202 Accepted` with Gate 3 commit confirmation.
Response on failure: `403 Forbidden` with reason code.

**Issue a GOT (GovOps console only):**
```
POST /govops/gate-override-tokens
Authorization: Bearer <govops_operator_jwt>
Content-Type: application/json

{
  "forecast_id": "<uuid>",
  "analyst_id": "<sso_sub>",
  "reason_code": "GOT-01",
  "notes": "SO agent confirmed degraded — MDS latency spike detected at 14:32 UTC"
}
```

---

## 4. Reason Codes

| Code | Name | Description | VP NAMA Authorization Required? | Post-Incident Review Required? |
|---|---|---|---|---|
| **GOT-01** | SO Agent Degraded | SO agent confirmed degraded — latency spike ≥ 3× baseline, calibration drift active, or MDS outlier rate > 15% in current window | No | Yes — within 48h |
| **GOT-02** | Stale Signal False Positive | A specific input signal (tariff feed, macro source, dealer data) confirmed offline or stale; SO block attributable to the stale signal | No | Yes — within 48h |
| **GOT-03** | LLM Provider Outage | SO service unavailable due to Anthropic API outage or network interruption; graceful degradation mode active | No | No (provider SLA review recommended) |
| **GOT-04** | Emergency Business Requirement | Forecast must advance despite SO block due to extraordinary business circumstance; cannot wait for SO issue to resolve | Yes — VP NAMA or Sponsor required | Yes — within 48h |
| **GOT-05** | Eval Gate Review In Progress | SO gate evaluation is under active review; temporary override while calibration is being assessed. Maximum validity: 24 hours (not the standard 4h TTL) | No | No (eval review serves as equivalent) |

**Note on GOT-05:** The 24-hour TTL for GOT-05 is the maximum. GovOps should issue a standard-duration GOT if the eval review is expected to complete within 4 hours. The extended TTL is only for cases where the calibration review will take longer than 4 hours.

---

## 5. Escalation Chain

When a Gate 3 commit is blocked by the SO agent, the following escalation sequence is automatically triggered by `gate-svc`:

```
T+0 min  ─── Block triggered
             │
             ├── Analyst notified on all preferred surfaces:
             │   Web app banner, Teams message, email, Morning Digest queue
             │
             └── Block reason displayed: MDS value, contributing signals,
                 SO agent confidence, suggested resolution steps

T+30 min ─── IF block is unresolved:
             │
             └── Automatic notification to GovOps on-call
                 (Teams @mention + email to govops-oncall DL)
                 Message includes: forecast_id, nameplate, analyst, MDS value,
                 timestamp, and link to GovOps console

T+2h     ─── IF block is unresolved:
             │
             └── Automatic notification to AI GovOps Lead (Don S.)
                 Direct Teams message + email
                 Notification includes: full escalation history, all
                 contributing signal health statuses, suggested reason code

T+3h     ─── IF block is unresolved:
             │
             └── Automatic notification to VP NAMA (Sponsor)
                 Outlook Adaptive Card + Teams message
                 Adaptive Card includes: one-tap authorize button for GOT-04
                 Authorization code is sent to GovOps Lead for final issuance

T+4h     ─── VP NAMA can authorize GOT-04 via:
             │   (a) Outlook Adaptive Card — "Authorize Override" button
             │   (b) Teams Adaptive Card — same one-tap button
             │   (c) GovOps console — manual VP authorization entry
             │
             └── On VP authorization: GovOps Lead issues GOT-04
                 GOT-04 TTL: 4 hours from issuance (not from T+0)
```

**Escalation suppression:** If the SO block resolves on its own (MDS drops below threshold, stale signal reconnects), the escalation chain is cancelled at whatever step it is at, and all previously notified parties receive a cancellation message.

**Analyst-initiated escalation:** An analyst may manually trigger the T+30min notification at any time via the "Request GovOps Review" button in the block notification UI. This does not skip steps — it accelerates the clock to the next step only.

---

## 6. Issuance Procedure (Step-by-Step)

**Prerequisites:** GovOps operator has received escalation notification and has access to the GovOps console in the Replit engineering app.

**Step 1 — Receive and assess escalation**

Review the escalation notification. Access the GovOps console and open the "Gate Block Details" panel for the `forecast_id`. Review:
- Current MDS value and trend (last 30 minutes)
- SO agent health status (latency, error rate, calibration drift indicator)
- Signal health dashboard (tariff feed, macro inputs, dealer data feed status)
- Analyst's submitted forecast and override reasoning

**Step 2 — Diagnose root cause**

Determine whether the block is:
- A legitimate SO block (forecast genuinely diverges; do NOT issue GOT; work with analyst to revise)
- A false positive due to identifiable SO agent or signal issue (proceed to Step 3)

Document the diagnosis in the GovOps console notes field. This text is included in the HIBT event.

**Step 3 — Select reason code**

Select the appropriate reason code from the GOT-01 through GOT-05 list (Section 4). If GOT-04 is required, obtain VP NAMA authorization before proceeding to Step 4.

**Step 4 — Issue GOT via GovOps console**

In the GovOps console:
1. Navigate to "Gate Override Tokens" → "Issue New GOT"
2. Enter `forecast_id` (pre-populated from escalation link)
3. Select reason code
4. Enter diagnosis notes (minimum 50 characters required)
5. Click "Issue GOT"

The console will:
1. Write `GATE_OVERRIDE_ISSUED` to HIBT (if HIBT write fails, GOT issuance is aborted)
2. Generate the signed GOT JWT
3. Return the `hibt_ref` for confirmation

**Step 5 — Deliver GOT to analyst**

The GovOps console delivers the GOT to the analyst automatically via:
- Web app notification (inline in the Gate 3 block UI — "Override Available" button)
- Teams direct message with the GOT reference
- Email with GOT reference and expiry time

The GOT is delivered as a reference link, not as the raw JWT. The analyst clicks "Use Override" in the Pit Wall UI; the UI retrieves and presents the GOT to the `gate-svc` API. The analyst never handles the raw JWT.

**Step 6 — Analyst consumes GOT**

The analyst clicks "Proceed with Gate 3 Commit" in the Pit Wall web app. The app calls `POST /forecasts/:id/gate-override` automatically. On success, `GATE_OVERRIDE_CONSUMED` is logged to HIBT and the Gate 3 commit proceeds normally.

**Step 7 — Gate 3 commit proceeds**

The Gate 3 commit completes and is logged to HIBT as a standard `GATE_3_COMMITTED` event. The override reference is included in the event payload.

**Step 8 — Post-incident review (if required)**

For GOT-01, GOT-02, or GOT-04: the GovOps operator must file a post-incident review within 48 hours. The review template is in the GovOps runbook. The review must document:
- Root cause of the SO false positive
- Corrective action taken or planned (e.g., signal reconnection, calibration review scheduled)
- Estimated timeline to remediation
- Whether a pattern is emerging (see Section 8 — anti-abuse threshold)

---

## 7. Audit Requirements

### 7.1 HIBT Logging

All GOT events (`GATE_OVERRIDE_ISSUED`, `GATE_OVERRIDE_CONSUMED`, `GATE_OVERRIDE_EXPIRED`, `GATE_OVERRIDE_REJECTED`) are written to HIBT with full payload including:
- `forecast_id`
- `analyst_pseudo_id` (not plaintext `analyst_id`)
- `issued_by_pseudo_id` (GovOps operator's pseudo-ID)
- `reason_code`
- `diagnosis_notes`
- `hibt_ref` (cross-reference chain)
- `expires_at`
- `consumed_at` (for `GATE_OVERRIDE_CONSUMED` events)

### 7.2 Weekly GovOps Dashboard

The GovOps dashboard (Leadership App → GovOps tab) displays weekly:
- Total GOTs issued by reason code
- GOTs consumed vs. expired ratio
- Nameplates with most GOT activity
- SO agent health trend (MDS distribution, latency P95, calibration drift score)
- Open post-incident reviews

The Sponsor role in the Leadership App has read access to all GOT data in the dashboard.

### 7.3 Automatic Calibration Review Trigger

**Threshold:** More than 2 GOT-01 or GOT-02 events attributed to the same SO agent issue within a single forecast cycle automatically triggers a mandatory SO calibration review.

On trigger:
1. `govops-svc` creates a `SO_CALIBRATION_REVIEW_TRIGGERED` HIBT event
2. GovOps Lead and Data Science team are notified
3. Review must be completed and findings documented within 5 business days
4. Review outcome is logged as a `SO_CALIBRATION_REVIEW_COMPLETED` HIBT event

---

## 8. Anti-Abuse Controls

### 8.1 Per-Cycle Per-Nameplate GOT Limit

| GOT Count | Authorization Required | Notes |
|---|---|---|
| 1st and 2nd GOT | GovOps Gate Guardian (standard) | Normal procedure |
| 3rd GOT | GovOps Gate Guardian + documentation of 1st and 2nd review completion | 3rd GOT may not be issued until post-incident reviews for 1st and 2nd are filed |
| 4th GOT (same cycle, same nameplate) | VP NAMA + GovOps Lead dual authorization | Both must approve via GovOps console; dual-auth is enforced at the API layer — a single-person token is rejected |

"Same cycle" is defined as the current forecast cycle boundary (typically bi-weekly or monthly). "Same nameplate" is defined by `nameplate_code`.

### 8.2 Visibility to Sponsor Role

All GOT issuance events are visible in real time to users holding the Sponsor role in the Leadership App. The Sponsor dashboard shows:
- All active (unconsumed, unexpired) GOTs — nameplate, reason code, age
- All GOTs issued in the last 30 days — trend chart by reason code
- Alert if any nameplate reaches the 3-GOT threshold in a cycle

The Sponsor role may not issue or revoke GOTs — visibility only.

### 8.3 GOT Revocation

The GovOps Lead may revoke an issued, unconsumed GOT before its expiry. Revocation is logged as `GATE_OVERRIDE_REVOKED` to HIBT. The analyst is notified immediately. Revocation may be used if:
- The diagnosis was incorrect (the block is a legitimate SO block, not a false positive)
- New information indicates the forecast should not proceed
- The analyst confirms they no longer need the override (e.g., they revised the forecast to resolve the MDS naturally)

Revocation does not count against the anti-abuse GOT count — only issuance counts.

### 8.4 Prohibited Uses

The following GOT issuance reasons are explicitly prohibited. GovOps operators are responsible for upholding these prohibitions:

- Issuing a GOT because the analyst disagrees with the SO result (analyst disagreement is not a valid reason; use the standard override challenge workflow)
- Issuing a GOT on behalf of an analyst who has not requested one
- Issuing a GOT under GOT-03 (provider outage) when the SO service is in fact operational
- Issuing a bulk GOT workaround by issuing multiple GOTs in rapid succession to clear a queue (triggers the 3-GOT threshold review)

Violation of these prohibitions is a GovOps policy violation and is subject to role revocation and HR review.

---

## 9. Open Questions

### OQ-1: GOT-04 VP Authorization via Adaptive Card — Implementation Timeline

The T+4h VP NAMA authorization via Outlook/Teams Adaptive Card requires integration with the Microsoft Adaptive Cards framework and GM's Teams tenant. This integration is not yet built. Until it is available, GOT-04 VP authorization is handled via direct Teams message from VP NAMA to GovOps Lead, with the message screenshot attached to the post-incident review as authorization evidence. **Owner:** Engineering. **Target:** v4.1 release.

### OQ-2: GOT Scope for Non-Gate-3 Blocks

This specification covers Gate 3 blocks only. Gates 1 and 2 also have DQ-based blocks that could be affected by SO miscalibration. A separate GOT scope for Gate 1 and Gate 2 may be needed. **Owner:** GovOps Lead. **Target:** Post-GA review.

### OQ-3: GovOps On-Call Rotation Formalization

The T+30min escalation to "GovOps on-call" presupposes a formal on-call rotation. The rotation schedule and tooling (PagerDuty integration or equivalent) need to be formalized before GA. **Owner:** GovOps Lead. **Target:** Before v4.0 GA.
