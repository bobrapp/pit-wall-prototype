# DQ Score Dimension Weight Governance

**Document ID:** GOV-003  
**Version:** 1.0  
**Date:** 2026-05-27  
**Status:** DRAFT — Pending GovOps Lead approval  
**Owner:** GovOps Lead (placeholder)  
**Related documents:** hibt-pseudonymization-spec.md, incident-severity-matrix.md, govops-bypass-role.md

---

## 1. Purpose

This document defines the governance process for modifying the six Data Quality (DQ) score dimension weights used throughout Pit Wall v4.0. It establishes an approval workflow, HIBT versioning requirements, prohibited configurations, and rollback procedures that collectively prevent unauthorized or accidental changes to the DQ framework.

The current state — where any engineer can adjust all six weights in real time via the Replit engineering app with a single "Apply to Cycle 5" button, with no approval gate and no audit trail — is a governance vulnerability. This document specifies the controls that must be implemented to close that vulnerability.

---

## 2. Why Weight Changes Are High-Stakes

DQ dimension weights are not simple configuration knobs. A change to these weights has cascading consequences that extend well beyond the current cycle:

### 2.1 Retroactive Reinterpretation of Historical Scores
Every DQ score ever computed is a function of the weights in effect at calculation time. If weights change, the meaning of historical scores changes implicitly. A forecast that was "DQ score 0.82" under one weight regime might be scored very differently under a new regime. This makes weight changes similar in impact to redefining a unit of measurement — the numbers stay the same but their significance shifts.

### 2.2 Gate 3 Suppression Risk
DQ scores feed directly into Gate 3 eligibility logic. A weight change that reduces the effective contribution of the `lineage_completeness_w` or `freshness_w` dimensions could allow low-quality forecasts to pass Gate 3 thresholds that were previously blocked. Because Gate 3 is the primary control on forecast quality, a malicious or careless weight change is a potential bypass of the most critical governance control in the platform.

### 2.3 Championship Scoring Integrity
The `override_accuracy_w` dimension is part of the Championship scoring formula. Changing this weight mid-cycle or retroactively changes the relative value of past override decisions and may create unfair competitive advantages for analysts whose override history happens to align with the new weighting. The Championship is used by analysts as a meaningful signal of forecasting judgment; unexpected rule changes undermine that trust.

### 2.4 HIBT Replay Determinism
The HIBT audit trail enables replay — re-running all computations for a historical cycle using the exact same inputs and parameters that produced the original result. If a replay uses different DQ weights than those in effect at the original decision time, the replay is no longer deterministic. This breaks the evidentiary value of the HIBT record for any audit, dispute resolution, or regulatory review. Weight versioning (section 5) is the technical mechanism that preserves replay determinism across weight changes.

---

## 3. DQ Dimension Weight Definitions

The six DQ score dimensions and their governance designations:

| Dimension Key | Description | Minimum Permitted | Maximum Permitted |
|---|---|---|---|
| `freshness_w` | Data recency relative to cycle timeline | 0.05 | 0.40 |
| `lineage_w` | Completeness of data lineage documentation | 0.05 | 0.40 |
| `override_acc_w` | Override accuracy relative to actuals (Championship) | **0.10 (floor)** | 0.40 |
| `consistency_w` | Cross-surface value consistency | 0.05 | 0.40 |
| `replay_w` | Replay determinism assurance | **0.05 (floor)** | 0.40 |
| `signal_coverage_w` | Breadth of signal inputs relative to catalog | 0.05 | 0.40 |

All six weights must sum to exactly 1.0 (tolerance: ±0.001).

---

## 4. Weight Change Classification

### 4.1 Minor Change
**Definition:** A change to one or two dimensions where no single dimension changes by more than 5 percentage points (±0.05), and the total weight sum remains 1.0 (±0.001).

**Approval required:** GovOps Lead only.  
**Turnaround SLA:** 2 business days.  
**Timing restriction:** Not permitted during active Gate 3 cycle (see Emergency classification below).

### 4.2 Major Change
**Definition:** Any of the following:
- A single dimension changes by ≥5 percentage points (≥0.05).
- Three or more dimensions change simultaneously in the same proposal.
- Any change to `override_acc_w` or `replay_w` regardless of magnitude (due to their floor constraints and downstream impact on Championship and replay integrity).

**Approval required:** GovOps Lead approval, followed by VP NAMA approval.  
**Turnaround SLA:** 5 business days.  
**Timing restriction:** Not permitted during active Gate 3 cycle.

### 4.3 Emergency Classification (Prohibited During Active Cycle)
**Definition:** Any weight change proposal — Minor or Major — submitted while a Gate 3 cycle is active (i.e., the cycle open date has passed and the Gate 3 deadline has not yet been reached).

**Status:** Prohibited. The Replit engineering app must reject any weight change submission while `cycle_status = ACTIVE` in the cycle management table.

**Rationale:** Mid-cycle weight changes would change the DQ score interpretation for nameplates already under analyst review, potentially invalidating decisions already made and creating inconsistency within a single cycle. No operational urgency justifies this risk. If a weight misconfiguration is causing an active incident, follow the emergency rollback procedure (section 7).

---

## 5. Approval Workflow

### Step 1: Engineer Proposes Change
The engineer navigates to the DQ Weight Management panel in the Replit engineering app. The panel shows:
- Current weight values for all six dimensions.
- The active `weight_version_id` and its effective date.
- A "Propose Change" form where the engineer enters:
  - New weight values (all six must be entered; unchanged dimensions carry over automatically).
  - Justification text (required, minimum 50 characters).
  - Supporting evidence or analysis (optional but recommended for Major changes).

The system validates the proposed weights before creating a WCP:
- Sum check: weights must total 1.0 (±0.001). If they do not, the form returns an error and does not proceed.
- Floor check: `replay_w` ≥ 0.05 and `override_acc_w` ≥ 0.10. Violations block submission.
- Ceiling check: no single dimension >0.40. Violations block submission.
- Cycle status check: if `cycle_status = ACTIVE`, submission is blocked with a message explaining the inter-cycle restriction.

### Step 2: System Generates Weight Change Proposal (WCP)
On successful submission, the system creates a WCP record:

```
WCP Record:
  wcp_id:               <UUID>
  status:               PENDING
  classification:       MINOR | MAJOR
  proposed_by:          <engineer_id>
  submitted_at:         <timestamp>
  current_weights:      {freshness: 0.xx, lineage: 0.xx, ...}
  proposed_weights:     {freshness: 0.xx, lineage: 0.xx, ...}
  delta_per_dimension:  {freshness: +0.xx, lineage: -0.xx, ...}
  estimated_impact:     {
                          current_cycle_dq_score_delta: +/- X.XX (avg across nameplates),
                          nameplates_crossing_threshold: N,
                          gate3_status_changes: [list of nameplate IDs if any]
                        }
  justification:        "<text>"
  supporting_evidence:  "<text or link>"
```

The `estimated_impact` field is computed live by running the proposed weights against the current cycle's in-flight DQ scores (read-only simulation — no state is changed).

### Step 3: GovOps Lead Notification
The WCP is sent to the GovOps Lead via:
- Slack DM with a summary and **Approve** / **Reject** action buttons (deep-linked to the approval UI).
- Email with the full WCP record attached.

The notification includes the estimated impact on current cycle DQ scores and any nameplates whose Gate 3 status would change if the weights were applied.

### Step 4: GovOps Lead Review
The GovOps Lead reviews the WCP in the approval UI. They must:
- Review the proposed weights, delta, and estimated impact.
- Check that the justification is substantive and not trivial.
- For changes affecting `override_acc_w` or `replay_w`: confirm the change is explicitly justified in terms of Championship and replay integrity impacts.
- Select **Approve** or **Reject** with a required comment.

For **Minor changes**: GovOps Lead approval completes the workflow (proceed to Step 6).  
For **Major changes**: GovOps Lead approval triggers Step 5.

### Step 5: VP NAMA Second Approval (Major Changes Only)
The system sends a second approval request to VP NAMA via Slack DM and email, including:
- The full WCP record.
- The GovOps Lead's approval comment.
- The estimated Gate 3 impact summary.

VP NAMA selects **Approve** or **Reject** with a required comment.

### Step 6: Change Applied
On final approval:
1. A new record is inserted into `dq_weight_versions` (see DDL in section 6) with `effective_from = NOW()` and the previous version's `effective_to` set to `NOW()`.
2. The change is logged to the HIBT as a `DQ_WEIGHT_CHANGE` event:
   ```json
   {
     "event_type": "DQ_WEIGHT_CHANGE",
     "wcp_id": "<wcp_id>",
     "old_weights": { "freshness_w": 0.xx, ... },
     "new_weights": { "freshness_w": 0.xx, ... },
     "approved_by": ["<govops_lead_id>", "<vp_nama_id_if_major>"],
     "justification": "<text>",
     "effective_from": "<timestamp>",
     "weight_version_id": "<new_version_uuid>"
   }
   ```
3. The engineering app updates to show the new active weight version.
4. A confirmation is sent to the proposing engineer, GovOps Lead, and (for Major changes) VP NAMA.

### Step 7: Rejection
On rejection at any step:
1. The WCP record is archived with `status = REJECTED` and the rejection comment.
2. The proposing engineer is notified via Slack and email with the rejection reason.
3. The engineer may submit a revised WCP addressing the rejection feedback, which begins a new workflow from Step 1.

---

## 6. HIBT Versioning for Weights

### 6.1 Principle: Replay Determinism
Every DQ score calculation record stored in the HIBT must include a `weight_version_id` foreign key pointing to the exact weight configuration used at calculation time. When a replay is executed for a historical cycle, the replay engine retrieves the `weight_version_id` from the original HIBT record and uses the weights from that version — not the current active weights.

This means weight changes never retroactively alter historical DQ score computations in the HIBT record. New calculations (new cycles, new replay runs executed under new weights) will use the current version. Historical HIBT records are immutable.

### 6.2 DDL: dq_weight_versions

```sql
CREATE TABLE dq_weight_versions (
  weight_version_id  VARCHAR(64)    PRIMARY KEY,       -- UUID
  effective_from     TIMESTAMPTZ    NOT NULL,
  effective_to       TIMESTAMPTZ,                      -- NULL = current active version
  freshness_w        DECIMAL(5,4)   NOT NULL,
  lineage_w          DECIMAL(5,4)   NOT NULL,
  override_acc_w     DECIMAL(5,4)   NOT NULL,
  consistency_w      DECIMAL(5,4)   NOT NULL,
  replay_w           DECIMAL(5,4)   NOT NULL,
  signal_coverage_w  DECIMAL(5,4)   NOT NULL,
  approved_by        VARCHAR(256),                     -- JSON array of approver IDs
  wcp_id             VARCHAR(64),                      -- FK to wcp_records table
  created_at         TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

  CONSTRAINT weights_sum_check CHECK (
    ABS(freshness_w + lineage_w + override_acc_w +
        consistency_w + replay_w + signal_coverage_w - 1.0) <= 0.001
  ),
  CONSTRAINT replay_floor CHECK (replay_w >= 0.05),
  CONSTRAINT override_acc_floor CHECK (override_acc_w >= 0.10),
  CONSTRAINT no_single_dimension_ceiling CHECK (
    freshness_w <= 0.40 AND
    lineage_w <= 0.40 AND
    override_acc_w <= 0.40 AND
    consistency_w <= 0.40 AND
    replay_w <= 0.40 AND
    signal_coverage_w <= 0.40
  )
);

-- Only one version may be active (effective_to IS NULL) at a time
CREATE UNIQUE INDEX one_active_version
  ON dq_weight_versions (effective_to)
  WHERE effective_to IS NULL;

-- Index for efficient historical lookup during replay
CREATE INDEX idx_weight_versions_effective_range
  ON dq_weight_versions (effective_from, effective_to);
```

### 6.3 DQ Score Calculation Record
Every DQ score record must include the weight version reference:

```sql
-- Fragment of DQ score calculation record (illustrative)
ALTER TABLE dq_score_calculations ADD COLUMN weight_version_id VARCHAR(64)
  REFERENCES dq_weight_versions(weight_version_id) NOT NULL;
```

---

## 7. Prohibited Weight Configurations

The following constraints are hard-coded in the system validation layer and enforced at both the application level (WCP submission) and the database level (DDL constraints). A WCP that would produce any of these states must be rejected automatically before entering the approval workflow.

| Constraint | Rule | Rationale |
|---|---|---|
| Weight sum | All six weights must sum to 1.0 (±0.001) | DQ score is a weighted average; non-unity sum breaks score normalization |
| Single dimension ceiling | No single dimension may exceed 0.40 | Prevents any one dimension from dominating the score to the point of making others irrelevant |
| Replay determinism floor | `replay_w` must be ≥ 0.05 | The replay_w dimension cannot be effectively disabled; removing it would allow non-deterministic replays to go undetected |
| Override accuracy floor | `override_acc_w` must be ≥ 0.10 | Championship integrity requires override accuracy to remain a meaningful contributor; a near-zero weight would decoupled Championship points from actual forecast quality |
| All weights non-negative | Every dimension weight must be ≥ 0 | Negative weights are semantically invalid |
| No fractional weights beyond 4 decimal places | Stored as DECIMAL(5,4) | Prevents floating-point precision issues in sum validation and score calculation |

---

## 8. Rollback Procedure

### 8.1 Standard Rollback
Re-activating a prior `weight_version_id` is treated as a new weight change and follows the same approval workflow as any other change (Minor or Major, depending on the delta between current weights and the target historical version's weights).

To initiate a rollback:
1. The engineer selects "Restore Version" on a historical `weight_version_id` in the weight management panel.
2. The system computes the delta between current weights and the historical version's weights.
3. A WCP is created with `classification` set automatically based on the delta.
4. The standard approval workflow proceeds from Step 3 onward.

### 8.2 Emergency Rollback (P1 Incident)
An emergency rollback is authorized when a weight change is believed to be causing a P1 incident (e.g., Gate 3 is blocking or unblocking nameplates incorrectly due to a misconfigured weight change).

**Emergency rollback authorization:** GovOps Lead alone (VP NAMA approval is waived for speed).

**Procedure:**
1. GovOps Lead confirms that the current weight configuration is contributing to the P1 incident.
2. GovOps Lead identifies the target rollback version (most recent stable version before the suspect change).
3. GovOps Lead executes rollback via admin CLI: `pit-wall-cli dq-weights --emergency-rollback --to-version <weight_version_id> --incident-id <incident_id>`.
4. System applies the rollback, writes `DQ_WEIGHT_EMERGENCY_ROLLBACK` event to HIBT.
5. GovOps Lead files a PIR within 24h (not 48h — emergency rollbacks require faster review).
6. The PIR must include: why the weight change caused the incident, why the standard workflow failed to catch it, and what process change prevents recurrence.

---

## Change Log

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | 2026-05-27 | GovOps Lead (TBD) | Initial draft — full weight change governance, approval workflow, HIBT DDL, prohibited configurations, rollback procedure |
