# Incident Severity Matrix and Response Runbooks

**Document ID:** GOV-002  
**Version:** 1.0  
**Date:** 2026-05-27  
**Status:** DRAFT — Pending GovOps Lead approval  
**Owner:** GovOps Lead (placeholder)  
**Related documents:** govops-bypass-role.md, data-residency-framework.md, hibt-pseudonymization-spec.md

---

## 1. Purpose

This document defines the formal incident severity classification system for Pit Wall v4.0, specifying who is paged at each severity level, what the resolution SLA is, and the step-by-step runbooks for each P1 scenario. It supplements the runbook stubs for the four known failure modes (`budget_breach`, `latency_spike`, `replay_drift`, `calibration_drift`) and adds additional scenarios identified during platform hardening.

All on-call engineers, GovOps personnel, and platform leads are required to be familiar with this document before handling production incidents.

---

## 2. Severity Level Definitions

### 2.1 Severity Matrix

| Level | Name | Definition | Response SLA | Who is Paged |
|---|---|---|---|---|
| **P1** | Critical | Gate 3 blocked on ≥1 nameplate during active cycle, any data loss event, HIBT write failure lasting >5 min | 15 min acknowledge, 1h resolution target | On-call engineer + GovOps Lead + VP NAMA (if >2h to Gate 3 deadline) |
| **P2** | High | SO latency p95 >90s sustained >10 min, DQ score calculation failure for ≥3 nameplates, surface sync lag >15 min | 30 min acknowledge, 4h resolution target | On-call engineer + GovOps Lead |
| **P3** | Medium | Single surface adapter failure (non-blocking), budget cap reaching 80% threshold, calibration drift detected outside tolerance | 2 hour acknowledge, next-business-day resolution target | On-call engineer |
| **P4** | Low | Non-critical feature degradation (e.g., AI Chat latency increase, non-blocking UI errors), Golden set staleness beyond scheduled refresh window, cost anomaly <20% above daily baseline | Next business day acknowledge | GovOps team via dashboard (no page) |

### 2.2 SLA Definitions

- **Acknowledge SLA:** Time from alert firing to on-call engineer confirming receipt and beginning investigation.
- **Resolution SLA:** Target time to restore service or implement an acceptable mitigation. Not a guarantee — complex incidents may exceed targets with documented justification.
- **Escalation trigger:** If the acknowledge SLA is missed, PagerDuty automatically escalates to the secondary on-call and GovOps Lead regardless of original severity level.

---

## 3. Incident Classification Decision Tree

Use this decision tree when an alert fires or an anomaly is reported. Start at the top and follow the first matching branch.

```
START: Incident or Alert Received
│
├── Is a Gate 3 commit blocked for ≥1 nameplate in an active cycle?
│   ├── YES ──────────────────────────────────────────────────────► P1 (Critical)
│   │                                                                 Page on-call + GovOps Lead
│   │                                                                 If >2h to Gate deadline: also page VP NAMA
│   └── NO
│       │
│       ├── Is there any confirmed data loss or HIBT write failure?
│       │   ├── YES ──────────────────────────────────────────────► P1 (Critical)
│       │   └── NO
│       │       │
│       │       ├── Is SO latency p95 >90s for >10 min OR
│       │       │   DQ calculation failing for ≥3 nameplates OR
│       │       │   surface sync lag >15 min?
│       │       │   ├── YES ──────────────────────────────────────► P2 (High)
│       │       │   │                                                 Page on-call + GovOps Lead
│       │       │   └── NO
│       │       │       │
│       │       │       ├── Is a single surface adapter down (non-blocking) OR
│       │       │       │   budget cap at 80% OR
│       │       │       │   calibration drift detected?
│       │       │       │   ├── YES ──────────────────────────────► P3 (Medium)
│       │       │       │   │                                         Page on-call engineer
│       │       │       │   └── NO
│       │       │       │       │
│       │       │       │       └── All other anomalies ───────────► P4 (Low)
│       │       │       │                                             Log to dashboard; no page
│       │       │       │
│       │       │       └── (continue to P4 if none of the above)
│
NOTES:
  - When in doubt between P1 and P2, always classify as P1.
  - A Gate 3 block caused by a known GOT override does NOT constitute a P1
    incident — it is working-as-designed. Verify GOT status before classifying.
  - Incidents may be downgraded after initial triage, never upgraded retroactively
    (start high, move down if evidence supports it).
```

---

## 4. P1 Runbooks

The following runbooks apply to all P1 incidents. Each begins with a **Detection** step to confirm the incident is genuine, followed by **Immediate mitigation**, **Resolution path**, and **Escalation** steps.

### 4.1 HIBT_WRITE_FAILURE

**Trigger condition:** HIBT write error rate >1% over a 5-min window, OR any confirmed event loss detected by the write audit log.

#### Detection
1. Check the HIBT write error dashboard (`pit-wall-ops/hibt-monitoring`).
2. Confirm errors are not transient (retry storm from a single service): look for error distribution across multiple services or write hosts.
3. Check the HIBT dead-letter queue depth. A rising DLQ depth confirms write failures are accumulating.
4. Run: `SELECT COUNT(*) FROM hibt_events WHERE written_at IS NULL AND created_at < NOW() - INTERVAL '5 minutes'` to quantify unwritten events.

#### Immediate Mitigation
1. Activate Redis write buffer: set `HIBT_WRITE_MODE=BUFFERED` in the platform config (Replit env or k8s configmap). This queues all new HIBT events to Redis stream `hibt:write-buffer` rather than attempting direct DB writes.
2. Verify buffer is accepting writes: check Redis stream length — it should be growing (not erroring).
3. Alert GovOps Lead that HIBT audit trail has a gap starting at the confirmed failure time. Document the gap start timestamp immediately.
4. Do NOT allow any Gate 3 commits while HIBT write failure is active. If a commit is imminent, issue a manual hold and notify GovOps Lead.

#### Resolution Path
1. Diagnose the root cause: connection pool exhaustion, disk full on HIBT DB host, schema migration lock, or dependency failure.
2. For connection pool exhaustion: increase pool size or identify and kill blocking connections. Check `pg_stat_activity` for long-running transactions.
3. For disk full: free space by archiving old partitions per the HIBT retention policy. Do not delete events — archive only.
4. Once DB writes are restored, set `HIBT_WRITE_MODE=NORMAL`.
5. Drain the Redis buffer: the HIBT drain service will replay buffered events in order. Confirm: `XLEN hibt:write-buffer` returns 0 and DLQ depth returns to baseline.
6. Run the HIBT completeness check: `SELECT * FROM hibt_completeness_audit WHERE cycle_id = '<current_cycle>'` — verify no gaps.
7. If any events are permanently lost, invoke the **Data Loss Protocol** (see section 4.5) — this remains a P1 until confirmed data loss is resolved or documented.

#### Escalation
- If not mitigated within 30 min: page VP NAMA regardless of Gate 3 proximity.
- If events are confirmed lost (not recoverable from buffer): notify Sponsor and schedule P1 PIR within 24h.
- All HIBT write failure incidents require a PIR regardless of duration.

---

### 4.2 GATE3_SO_FALSE_BLOCK

**Trigger condition:** Gate 3 is blocked by a Second Opinion MDS score above the block threshold, but the underlying signal data has not changed materially since the last successful commit — indicating a potential SO model anomaly, not a genuine forecast concern.

#### Detection
1. Retrieve the blocking SO analysis from the HIBT event log: `SELECT * FROM hibt_events WHERE event_type = 'SO_ANALYSIS' AND cycle_id = '<current_cycle>' ORDER BY created_at DESC LIMIT 5`.
2. Compare the MDS score trend. A legitimate block should show MDS increasing in response to a signal change. A false block shows MDS spike without corresponding signal change.
3. Check the SO API response for factor citations. A false block often shows:
   - Factors cited that are not present in the current signal catalog (hallucinated factors).
   - Confidence scores inconsistent with prior responses on similar signal sets.
   - MDS jump of >20pp in a single recalculation without signal delta.
4. Verify signal data freshness: confirm the signal inputs to the SO call are current and not stale.
5. Check SO API error logs for elevated error rates or timeout retries that may have produced a degraded response.

#### Immediate Mitigation
1. If false block is confirmed by GovOps Lead review, issue a **Gate Override Token (GOT)** per the govops-bypass-role.md procedure.
   - GOT type for this scenario: `GOT-02` (SO False Block Override).
   - GOT must include: MDS score at time of block, reason code `SO_FALSE_BLOCK`, confirming engineer, GovOps Lead approval timestamp.
2. Apply GOT to the blocked nameplate(s). Gate 3 unblocks immediately upon GOT issuance.
3. Set a monitoring watch on the SO service: if MDS scores continue to show anomalous behavior across ≥3 nameplates, escalate to P1 `LLM_PROVIDER_OUTAGE` (section 4.3).

#### Root Cause Investigation
1. Retrieve the full SO API request payload and response from the HIBT log.
2. Run the response through the grounding check validator manually: `pit-wall-cli so-validate --event-id <hibt_event_id>`.
3. If hallucinated factors confirmed: file a provider incident report with Anthropic. Include sanitized prompt and response (Tier 3 data scrubbed per data-residency-framework.md).
4. If the model response was valid but the MDS calculation logic produced an anomalous score: investigate the MDS aggregation function for edge cases with the current signal distribution.
5. Document findings in the GOT record within 24h.

#### Escalation
- If GOT cannot be issued within 30 min (GovOps Lead unavailable): page VP NAMA for emergency GOT authorization.
- If the same nameplate triggers a false block in two consecutive cycles: mandatory GovOps review of SO calibration before next cycle opens.

---

### 4.3 LLM_PROVIDER_OUTAGE

**Trigger condition:** SO API call error rate exceeds 5% over a 5-min rolling window, OR API latency p99 exceeds 120s, OR the SO service reports provider unavailability.

#### Detection
1. Check the SO service health endpoint: `GET /api/so/health` — response should include `provider_status: ok`.
2. Check the SO error rate metric in the ops dashboard. Confirm errors are from the provider (HTTP 5xx, timeout) versus internal errors (400-series, bad request).
3. Check Anthropic status page (or configured status webhook) for declared incidents.
4. Distinguish partial outage (some calls failing) from full outage (all calls failing). Partial outages may not require full graceful degradation.

#### Immediate Mitigation
1. If error rate is between 5% and 25% (partial outage):
   - Enable SO retry with exponential backoff (max 3 retries, 30s max delay).
   - Monitor for 15 min. If error rate does not drop below 5%, proceed to full graceful degradation.
2. If error rate exceeds 25% or full outage confirmed:
   - Set SO service to **graceful degradation mode**: `pit-wall-cli so-mode --set graceful-degradation`.
   - In this mode:
     - SO service returns `status: unavailable` for all requests.
     - MDS score field is set to `null`.
     - Gate 3 is automatically unblocked for all nameplates with annotation `GOT-03: LLM_PROVIDER_OUTAGE`.
     - The GOT-03 annotation is written to the HIBT log with a timestamp.
     - Analysts are notified via Slack (`#pit-wall-ops`) that SO is unavailable.
3. If an on-premises or fallback LLM endpoint is configured (`SO_FALLBACK_ENDPOINT` env var is set):
   - Evaluate fallback quality: run the standard calibration probe against the fallback endpoint.
   - If calibration probe passes (MAPE delta <5pp versus baseline), activate fallback: `pit-wall-cli so-mode --set fallback`.
   - Log the fallback activation to HIBT as `SO_FALLBACK_ACTIVATED`.
   - Note: fallback model may have different bias characteristics — GovOps Lead must be notified before activating.

#### Resolution Path
1. Monitor provider status. When provider reports resolution, run a health probe before re-enabling: `pit-wall-cli so-probe --count 10`.
2. If probe passes (error rate <1%, latency p95 <60s), disable graceful degradation: `pit-wall-cli so-mode --set normal`.
3. Nameplates that committed without SO review during the outage are annotated with `GOT-03` in the HIBT record. These nameplates are flagged for retrospective SO review in the next available cycle.
4. If a fallback was activated: deactivate fallback, revert to primary provider, and run a full calibration comparison between fallback and primary outputs for the affected cycle period. Log findings to HIBT.

#### Escalation
- Outage lasting >1h during active Gate 3 window: page VP NAMA.
- Outage lasting >4h regardless of Gate proximity: mandatory PIR.

---

### 4.4 SURFACE_CONSISTENCY_BREACH

**Trigger condition:** Cross-surface sync lag exceeds 15 min on ≥3 surfaces simultaneously, OR a confirmed data divergence is detected between surfaces (same nameplate, same cycle, different values on two different surfaces).

#### Detection
1. Check the surface sync dashboard for lag metrics per surface: `pit-wall-ops/surface-sync`.
2. Run the cross-surface consistency probe: `pit-wall-cli surface-check --cycle <cycle_id> --threshold 15m`.
3. If divergence (not just lag) is suspected: run `pit-wall-cli surface-diff --nameplate <id> --surfaces all` to identify which surfaces hold different values for the same nameplate/cycle combination.
4. Determine scope: how many nameplates are affected, which surfaces are out of sync, and since when.
5. Check the surface adapter error logs for the affected surfaces to identify the upstream cause (adapter failure, message queue backup, schema mismatch).

#### Immediate Mitigation
1. Notify all active analysts via Slack (`#pit-wall-forecast-ops`): "Surface consistency issue detected — do not use [affected surfaces] for decision-making until resolved. Use [canonical surface] as source of truth."
2. Identify the canonical source of truth: this is the HIBT-backed primary surface. All other surfaces should be treated as read-only cache during the incident.
3. Pause any automated downstream processes that consume surface data (scheduled exports, feed pushes) until consistency is restored.

#### Force-Refresh Procedure
1. For each affected surface adapter, trigger a forced resync: `pit-wall-cli surface-resync --surface <surface_id> --from-canonical`.
2. Monitor resync progress: lag should decrease monotonically. If a surface lag is not decreasing after 10 min, the adapter may be in a degraded state.
3. For a degraded adapter: restart the adapter service. If restart does not resolve: disable the adapter and route traffic to canonical surface only.
4. Once all surfaces report lag <2 min: run the consistency probe again to confirm values are aligned.
5. Notify analysts that surfaces are restored.

#### Analyst Notification Template
```
[INCIDENT NOTICE — SURFACE CONSISTENCY]
Time: <timestamp>
Affected surfaces: <list>
Status: Under investigation / Resync in progress / Resolved
Action required: <specific guidance>
Point of contact: <on-call engineer name>
Next update: <time>
```

#### Escalation
- If resync does not complete within 2h: escalate to P2, page GovOps Lead.
- If data divergence (not just lag) is confirmed and cannot be resolved from canonical: treat as potential data loss, escalate to P1 HIBT_WRITE_FAILURE protocol.

---

## 5. On-Call Rotation Requirements

### 5.1 Coverage Requirements
- **Coverage window:** 24 hours a day, 7 days a week, 365 days a year.
- **Minimum rotation size:** 2 engineers per rotation tier (primary + secondary).
- **Shift length:** Maximum 7 consecutive days on primary on-call before mandatory rotation.
- **Active cycle coverage:** During the 72h window preceding any Gate 3 deadline, a dedicated GovOps engineer must be designated as "Gate Watch" in addition to the standard on-call rotation.

### 5.2 Escalation Chain

```
Level 1: On-Call Engineer (primary)
         ↓ (if acknowledge SLA missed OR engineer requests support)
Level 2: On-Call Engineer (secondary) + GovOps Lead
         ↓ (if P1 not mitigated within 1h OR Gate 3 deadline <2h away)
Level 3: VP NAMA + Platform Architect
         ↓ (if P1 not mitigated within 4h OR confirmed data loss)
Level 4: Sponsor + Legal/Compliance (if data loss involves Tier 3 data)
```

### 5.3 On-Call Responsibilities
- Acknowledge PagerDuty alerts within the SLA for the incident severity.
- Maintain a running incident log in the designated incident channel (`#pit-wall-incidents-<date>`).
- Update the incident status every 30 min during active P1/P2 incidents.
- Initiate PIR scheduling before going off-call if a P1 or P2 occurred during the shift.

### 5.4 Tooling Access
All on-call engineers must have current credentials and verified access to:
- PagerDuty (alert acknowledgment and escalation)
- `pit-wall-cli` with on-call permissions profile
- HIBT ops dashboard (read + audit access)
- Surface sync dashboard
- SO service admin endpoint
- Slack `#pit-wall-ops` and `#pit-wall-incidents-*`
- Platform runbook repository (this document)

Access verification is performed at the start of each on-call rotation.

---

## 6. Post-Incident Review Requirements

### 6.1 PIR Triggers
| Severity | PIR Required | Deadline | Distribution |
|---|---|---|---|
| P1 | Always | Within 48h of incident resolution | On-call team, GovOps Lead, VP NAMA, Sponsor |
| P2 | Always | Within 48h of incident resolution | On-call team, GovOps Lead |
| P3 | If recurring (same issue within 30 days) | Within 1 week | On-call team, GovOps Lead |
| P4 | No | N/A | N/A |

### 6.2 PIR Template

```
# Post-Incident Review — [Incident ID] [Brief Title]

**Severity:** P[1/2/3]
**Duration:** <start time> to <end time> (total: Xh Ym)
**Prepared by:** <author>
**Review date:** <date>
**Participants:** <names and roles>

---

## 1. Timeline

| Time (UTC) | Event |
|---|---|
| HH:MM | Incident triggered / alert fired |
| HH:MM | On-call acknowledged |
| HH:MM | <key diagnostic step> |
| HH:MM | Mitigation applied |
| HH:MM | Incident resolved |

## 2. Impact

- Systems affected:
- Nameplates/cycles affected (if applicable):
- Analyst-facing impact:
- Data integrity impact:
- Gate 3 impact (if applicable):

## 3. Root Cause

<Concise description of the technical root cause. Be specific — avoid vague language like "human error."
Focus on the system or process condition that made the failure possible.>

## 4. Contributing Factors

- <Factor 1: e.g., monitoring gap that delayed detection>
- <Factor 2: e.g., runbook gap that slowed resolution>
- <Factor 3: e.g., dependency without circuit breaker>

## 5. What Went Well

- <observation>

## 6. What Did Not Go Well

- <observation>

## 7. Remediation Actions

| Action | Owner | Due Date | Status |
|---|---|---|---|
| <specific corrective action> | <name> | <date> | Open |

## 8. Preventive Actions (Long-Term)

| Action | Owner | Due Date |
|---|---|---|
| <systemic change to prevent recurrence> | <name> | <date> |

## 9. Follow-Up Items

- [ ] Verify remediation actions are complete by <date>
- [ ] Re-run relevant chaos/fault-injection test after fix deployed
- [ ] Update runbook if gaps identified
```

### 6.3 PIR Process
1. The on-call engineer who handled the incident drafts the PIR using the template above.
2. GovOps Lead reviews and approves the PIR before distribution.
3. P1 PIRs are shared with the Sponsor and VP NAMA within the 48h window.
4. Action items from PIRs are tracked in the GovOps backlog. Overdue PIR actions are escalated to the GovOps Lead at the weekly governance sync.
5. PIRs are stored in the governance document repository and linked to the original HIBT incident record.

---

## 7. Monitoring and Alerting Specification

### 7.1 Key Metrics and Alert Thresholds

| Metric | P1 Threshold | P2 Threshold | P3 Threshold | Alert Channel |
|---|---|---|---|---|
| Gate 3 block status | Any active block during cycle | N/A | N/A | PagerDuty (P1) |
| HIBT write error rate | >1% over 5 min | N/A | Any write errors | PagerDuty (P1), Slack |
| HIBT write lag | >5 min | >2 min | >30s | PagerDuty (P1/P2), Slack |
| SO API error rate | >25% over 5 min | >5% over 10 min | >1% over 30 min | PagerDuty (P1/P2), Slack |
| SO API latency p95 | >120s | >90s | >60s | PagerDuty (P1/P2), Slack |
| DQ calculation failure | ≥5 nameplates | ≥3 nameplates | ≥1 nameplate | PagerDuty (P1/P2), Slack |
| Surface sync lag | >30 min on ≥3 surfaces | >15 min on ≥3 surfaces | >15 min on 1 surface | PagerDuty (P1/P2), Slack |
| Budget utilization | N/A | N/A | ≥80% of cap | Slack, email |
| Calibration drift score | N/A | N/A | Outside tolerance band | Slack, email |
| Golden set staleness | N/A | N/A | N/A | Dashboard (P4) |
| API cost anomaly | N/A | N/A | N/A | Dashboard (P4 if <20% over baseline) |

### 7.2 Alert Channels

| Channel | Use Case | Notes |
|---|---|---|
| **PagerDuty** | P1 and P2 incidents | Pages on-call rotation; escalates automatically if unacknowledged |
| **Slack `#pit-wall-ops`** | All P1/P2/P3 alerts, status updates | All on-call and GovOps members must be in this channel |
| **Slack `#pit-wall-incidents-<date>`** | Per-incident discussion channel created at incident start | Archived after PIR is complete |
| **Email** | P3 alerts where no immediate response is needed, PIR distribution | On-call distribution list |
| **Ops Dashboard** | P4 items, trend monitoring | Reviewed daily by GovOps; no active paging |

### 7.3 Alert Noise Management
- All P3 and P4 alerts must be reviewed weekly. Alerts that fire frequently without resulting in an incident are candidates for threshold adjustment.
- Alert threshold changes require GovOps Lead approval and must be logged as a configuration change in the HIBT audit trail.
- "Alert fatigue" incidents (where a genuine P1 was missed due to noise) automatically generate a P3 process improvement ticket.

---

## Change Log

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | 2026-05-27 | GovOps Lead (TBD) | Initial draft — all four P1 runbooks, severity matrix, on-call requirements, PIR template |
