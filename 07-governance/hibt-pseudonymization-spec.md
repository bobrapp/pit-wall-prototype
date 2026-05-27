# HIBT Pseudonymization Specification

**Document ID:** GOV-001  
**Version:** 1.0  
**Status:** Draft — Pending Legal Review  
**Author:** [GovOps Lead — to be assigned]  
**Last Updated:** 2026-05-27  
**Review Cycle:** Annual (or on any schema change to HIBT or identity_map)

---

## 1. Overview

### 1.1 Problem Statement

The How-I-Built-This (HIBT) immutable audit ledger is a foundational integrity mechanism in Pit Wall v4.0. Every forecast action — override, gate commit, DQ dismissal, Second Opinion acceptance or rejection — is written as an append-only record to HIBT. Records must be retained for 7 years to satisfy NAMA audit requirements and support post-hoc accuracy attribution (Championship Table, Ghost Lap).

In its naive implementation, HIBT records would include the analyst's real identity (SSO subject, display name, email) alongside timestamps and reasoning text. This creates a direct conflict with:

- **GDPR Article 17** (Right to Erasure / Right to be Forgotten): an identifiable data subject may request deletion of their personal data. An immutable ledger that stores PII directly cannot satisfy this right without destroying audit integrity.
- **CCPA** (California Consumer Privacy Act): confers similar deletion rights for California residents.
- **Anticipated Michigan Consumer Data Privacy Act** obligations.

### 1.2 Design Decision

Pseudonymization at write time. Analyst identity is never written directly into HIBT records. Instead, each record stores a stable, opaque `analyst_pseudo_id` derived from the analyst's SSO subject and an organization-scoped secret salt. A separate, deletable `identity_map` table holds the mapping between pseudo IDs and real identities.

Erasure is implemented by deleting (or zeroing) the `identity_map` row. HIBT records persist unchanged — audit integrity is fully preserved — but the link between the pseudo ID and any real person is permanently severed. After erasure, no replay of HIBT records can re-identify the subject.

This approach satisfies GDPR Article 17 by rendering the HIBT records effectively anonymous (per Recital 26: data that cannot be attributed to a natural person without disproportionate effort is not personal data). HIBT itself is not modified.

### 1.3 Scope

This specification applies to:
- All HIBT write paths in `hibt-svc`
- The `identity_map` table in the Pit Wall operational database
- The GDPR/CCPA erasure workflow in the GovOps console
- Any downstream feature that resolves `analyst_pseudo_id` to a display name

---

## 2. Data Model

### 2.1 HIBT Record Structure (no change to existing ledger schema)

HIBT records store `analyst_pseudo_id` (a 64-character hex string) in place of any real identity field. No other changes to the HIBT schema are required. Existing fields — `forecast_id`, `action_type`, `timestamp`, `reasoning_text`, `nameplate_code`, `gate_stage` — remain unchanged.

### 2.2 Identity Map Table

```sql
CREATE TABLE identity_map (
  analyst_pseudo_id    VARCHAR(64)   PRIMARY KEY,  -- HMAC-SHA256(analyst_sso_sub, org_secret_salt), hex-encoded
  analyst_id           VARCHAR(64)   NOT NULL,     -- real identity (SSO sub / OIDC subject claim)
  display_name         VARCHAR(128),               -- human-readable name at time of first write
  email                VARCHAR(256),               -- work email at time of first write
  created_at           TIMESTAMPTZ   NOT NULL,
  erasure_requested_at TIMESTAMPTZ,               -- set when request received from GDPR portal
  erased_at            TIMESTAMPTZ,               -- set when operator executes deletion
  erased_by            VARCHAR(64)                -- GovOps operator SSO sub who executed erasure
);
```

**Access controls:**
- Read: GovOps role only (not accessible to analysts, leadership app, or any product surface)
- Write (INSERT): `hibt-svc` service account only (on first write for a new analyst)
- Delete (DELETE row): GovOps operator role only, gated by erasure workflow in GovOps console
- No application-layer UPDATE is permitted on `analyst_id`, `email`, or `display_name` after row creation (enforced via row-level security policy)

### 2.3 Erasure Audit Log Table

Erasure events are logged to a separate table, not to HIBT. This table is append-only and retained for 10 years per regulatory requirement.

```sql
CREATE TABLE erasure_audit_log (
  erasure_id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  analyst_pseudo_id    VARCHAR(64)   NOT NULL,     -- the pseudo ID that was erased
  request_channel      VARCHAR(32)   NOT NULL,     -- 'gdpr_portal' | 'ccpa_portal' | 'legal_ticket'
  request_received_at  TIMESTAMPTZ   NOT NULL,
  jurisdiction         VARCHAR(32)   NOT NULL,     -- 'GDPR' | 'CCPA' | 'OTHER'
  verified_by          VARCHAR(64)   NOT NULL,     -- GovOps operator SSO sub
  executed_at          TIMESTAMPTZ,
  executed_by          VARCHAR(64),                -- GovOps operator SSO sub (may differ from verifier)
  completion_status    VARCHAR(32)   NOT NULL,     -- 'PENDING' | 'EXECUTED' | 'DENIED' | 'WITHDRAWN'
  denial_reason        TEXT,                       -- populated if completion_status = 'DENIED'
  notes                TEXT
);
```

---

## 3. Pseudo-ID Generation

### 3.1 Algorithm

```
analyst_pseudo_id = HMAC-SHA256(key=org_secret_salt, message=analyst_sso_sub)
                    encoded as lowercase hex (64 characters)
```

- `analyst_sso_sub`: the OIDC `sub` claim from the GM SSO provider. This is stable for the lifetime of the analyst's identity in the IdP.
- `org_secret_salt`: a secret value stored in the platform's secrets manager (Azure Key Vault). One salt value per organization (NAMA, GMNA Finance, etc.).

### 3.2 Salt Lifecycle

| Event | Action |
|---|---|
| Platform initial deploy | Generate `org_secret_salt_v1`, store in Key Vault, record activation date |
| Annual rotation | Generate `org_secret_salt_v2`. New HIBT writes use v2. Existing pseudo IDs computed with v1 remain valid — no retroactive re-hashing. |
| Old salt retention | v1 retained in Key Vault for 7 years to allow pseudo-ID verification during the HIBT retention window. Access to retired salts is restricted to GovOps role. |
| Salt after erasure | If an analyst's identity_map row is deleted, their pseudo_id can no longer be recomputed even if the salt is available — because the `analyst_sso_sub` is only known from the deleted row. This is by design. |

### 3.3 Salt Rotation Impact

Because pseudo IDs are stable per (analyst, salt version), an analyst who writes HIBT records before and after a salt rotation will have two different pseudo IDs in the ledger. The identity_map table holds one row per pseudo ID. This is acceptable: the analyst's actions remain attributable during the retention window via either pseudo ID, and both rows are deleted on an erasure request.

`hibt-svc` must look up the current active salt version at write time. The active salt version is a platform configuration value, not hardcoded.

---

## 4. Erasure Workflow

### Step 1 — Analyst Submits Erasure Request

The analyst (or their legal representative) submits an erasure request via the GDPR/CCPA self-service portal (URL: [to be confirmed by Legal]). The portal:
- Authenticates the requestor via GM SSO or a verified email challenge
- Records the `analyst_sso_sub`, request timestamp, and jurisdiction
- Sets `identity_map.erasure_requested_at` for all rows matching the `analyst_id`
- Immediately triggers cessation of Morning Digest delivery for this analyst (see Section 6)
- Creates a row in `erasure_audit_log` with `completion_status = 'PENDING'`
- Sends a confirmation email to the analyst's address of record

### Step 2 — GovOps Verification

A GovOps operator reviews the request within 5 business days (GDPR Article 12(3) deadline is 30 days; internal SLA is 5 business days). Verification confirms:
- The requestor's identity matches the `analyst_id` in the identity_map
- The analyst is no longer employed (or is a former contractor) — active employees cannot erase their identity while their records are under active audit review, but may schedule erasure for the end of their record retention obligation
- The jurisdiction claim is confirmed (GDPR applies to EU/EEA residents; CCPA applies to California residents)
- No active legal hold covers this analyst's HIBT records

If verification fails or a legal hold is active, the request is denied and `erasure_audit_log.completion_status` is set to `'DENIED'` with a `denial_reason`. The requestor is notified within the statutory deadline.

### Step 3 — GovOps Operator Executes Erasure

The GovOps operator executes the following via the GovOps console (not directly via psql in production):

```sql
-- Executed by GovOps console, not manually
DELETE FROM identity_map
WHERE analyst_id = :analyst_sso_sub;
```

The console:
1. Previews the rows that will be affected (one per salt version the analyst was active under)
2. Requires a second GovOps operator to confirm (four-eyes principle)
3. Executes the DELETE within a transaction
4. Updates `erasure_audit_log` with `executed_at`, `executed_by`, and `completion_status = 'EXECUTED'`

### Step 4 — HIBT Records Become Permanently Anonymous

After deletion of the `identity_map` rows:
- All HIBT records bearing this analyst's `analyst_pseudo_id` remain in the ledger unchanged
- No display name, SSO sub, or email can be recovered from those records
- Even GovOps operators with access to the Key Vault cannot re-identify the records, because the `analyst_sso_sub` required to recompute the HMAC is only known from the now-deleted `identity_map` row
- The `erasure_audit_log` row confirms the erasure occurred but contains only the `analyst_pseudo_id` — not the real identity

The erasure is complete. No further action is required on HIBT.

---

## 5. Feature Impact

The following product features resolve `analyst_pseudo_id` to a display name by joining against `identity_map`. After erasure, the join returns no row; features must handle this gracefully.

| Feature | Behavior Before Erasure | Behavior After Erasure |
|---|---|---|
| Championship Table | Analyst's name and points displayed normally | Analyst appears as "Former Analyst" with all points preserved. Season standings integrity is maintained. Sort order unchanged. |
| Ghost Lap | Personal accuracy history attributed to analyst's display name | History becomes anonymous. Accuracy metrics remain visible as an unlabeled benchmark for calibration reference. |
| Morning Digest | Personalized delivery to analyst's registered email | Ceases immediately upon receipt of erasure request (Step 1), before operator verification. Digest is not queued or deferred. |
| HIBT Ledger Explorer | Entries show analyst display name with link to profile | Erased entries display `analyst_pseudo_id` string only. No name, no profile link. A tooltip reads "Identity erased per data subject request." |
| Second Opinion Attribution | Second Opinion results attributed to analyst for calibration scoring | Anonymous after erasure. Historical MDS contributions from this analyst remain in aggregate calibration metrics but are not individually attributed. |
| GovOps Dashboard | Analyst visible in active analyst roster | Removed from roster view. Erasure event visible in the GovOps audit log. |

---

## 6. Boundary: What Is and Is Not Pseudonymized

This section defines the precise boundary of personal data in HIBT to prevent scope creep or misapplication of pseudonymization to non-personal fields.

### Fields that ARE pseudonymized (personal data)

| Field | Treatment |
|---|---|
| Analyst SSO sub / identity | Replaced by `analyst_pseudo_id` at write time |
| Display name | Stored only in `identity_map`, not in HIBT |
| Email address | Stored only in `identity_map`, not in HIBT |

### Fields that are NOT pseudonymized (business records, not personal data)

| Field | Rationale |
|---|---|
| Nameplate names | Business records; not personal data |
| Forecast values (P10, P50, P90) | Numerical business data |
| Timestamps | Business records; cannot be suppressed without destroying audit utility |
| Action types (OVERRIDE, GATE_COMMIT, etc.) | Business process records |
| Reasoning text (analyst-authored free text) | Business records — **but see Open Question 1 below** |
| DQ scores | System-generated metrics |
| Gate stage | Process metadata |
| Second Opinion verdict | System-generated output |

The boundary follows GDPR Recital 26: data that does not relate to an identified or identifiable natural person is not personal data. Timestamps and action types, in isolation, do not identify a person; the only identifying link is through `analyst_pseudo_id`, which is severed on erasure.

---

## 7. Retention Schedule

| Data Store | Retention Period | Deletion Trigger |
|---|---|---|
| `identity_map` rows | Until erasure request is executed | GovOps operator DELETE per erasure workflow |
| HIBT records | 7 years from write date | Automated purge job; pseudo IDs retained as anonymous records |
| `erasure_audit_log` | 10 years from erasure execution date | Automated purge job |
| Key Vault: active org_secret_salt | Indefinite while platform is live | Manual decommission only |
| Key Vault: retired org_secret_salt versions | 7 years from retirement date | Automated rotation cleanup after 7-year window |

The 10-year retention on `erasure_audit_log` exceeds the 7-year HIBT retention. This is intentional: regulators may request evidence of erasure compliance years after the underlying HIBT records have themselves been purged.

---

## 8. Open Questions

### OQ-1 — Reasoning Text May Contain PII

**Issue:** The `reasoning_text` field in HIBT is analyst-authored free text entered at override or gate commit time. An analyst may write reasoning that contains third-party PII (e.g., "I spoke with dealer John Smith in Detroit who confirmed Q3 demand is soft" or "Per email from VP [name], we are holding the Gate 3 commit").

**Risk:** This text is in HIBT, not in `identity_map`. Pseudonymizing the author does not remove PII embedded in the text itself. A GDPR request from John Smith (the dealer contact, not the analyst) would require identifying and redacting his name from HIBT records — which cannot be done without modifying the immutable ledger.

**Proposed resolution options (pending Legal review):**
1. **Content scanning at write time:** Run `reasoning_text` through a PII detection classifier (e.g., Azure AI Language PII detection) before HIBT write. Flag records containing names, email addresses, or phone numbers. Require analyst to confirm or redact before commit.
2. **Advisory-only mode:** Display a warning in the override UI reminding analysts not to include third-party names or contact details in reasoning text. Rely on policy rather than enforcement.
3. **Structured reasoning templates:** Replace free-text with structured dropdowns/checkboxes for common reasoning types. Allow free text only in a field explicitly labeled as "internal, subject to audit, do not include personal names."

**Owner:** Legal (GDPR counsel) + Product (Pit Wall PM)  
**Target resolution:** Before GA launch

### OQ-2 — Cross-Org Analyst Transfers

**Issue:** If an analyst transfers from NAMA to GMNA Finance (a different org with a different `org_secret_salt`), their pseudo IDs in each org's HIBT ledger are different. An erasure request must cover both. The current workflow is scoped to a single org.

**Proposed resolution:** GDPR portal must collect all org affiliations from the HR system at request submission time and initiate erasure across all affected orgs. Requires cross-org GovOps coordination.

**Owner:** GovOps Lead  
**Target resolution:** Q3 2026

### OQ-3 — Contractor Identity in IdP

**Issue:** Contractors may use a different SSO provider or have their `sub` claim change at contract renewal. This could result in multiple pseudo IDs for the same human. The identity_map may not capture this linkage.

**Proposed resolution:** HR system must maintain a stable `analyst_id` that is decoupled from the IdP `sub`. HMAC should be computed over the stable HR identifier, not the raw OIDC sub. Requires HR system integration.

**Owner:** Platform Engineering + HR Systems  
**Target resolution:** Pre-launch

---

*End of GOV-001 v1.0*
