# Championship Feature: HR and Ethics Policy

**Document ID:** GOV-004  
**Version:** 1.0  
**Date:** 2026-05-27  
**Status:** DRAFT — Pending HR review and GovOps Lead approval  
**Owner:** GovOps Lead (placeholder) + HR Business Partner (placeholder)  
**Related documents:** dq-weight-governance.md, hibt-pseudonymization-spec.md

---

## 1. Purpose Statement

The Championship Table is a peer recognition system designed to celebrate forecasting expertise and drive continuous improvement in override judgment. It exists to give analysts meaningful feedback on the quality of their decisions over time and to create positive recognition for accurate, well-reasoned forecasts.

**Accuracy in forecasting is one signal among many in an analyst's overall contribution.** The Championship is not, and must never function as, a performance evaluation tool. An analyst who ranks lower on the Championship Table may still be an exceptional contributor to the team — through mentorship, process improvement, data quality work, cross-functional collaboration, and other dimensions of performance that the Championship does not and cannot measure.

This policy establishes the rules, access controls, and prohibitions that maintain the Championship as a supportive feature rather than a surveillance mechanism.

---

## 2. What the Championship Is

The Championship is:

- **A peer recognition system** for forecasting accuracy and override judgment, modeled on the idea that expertise in high-stakes decisions deserves acknowledgment.
- **A personal improvement tool** that allows each analyst to track their own forecasting accuracy trajectory across cycles, identify patterns in their override decisions, and understand how their judgment compares to actuals over time.
- **A source of positive reinforcement** for accurate override calls. Points are awarded for overrides that improve on the model forecast — the Championship celebrates the instances where analyst judgment added value, not the instances where it did not.
- **A team calibration resource** allowing team leads and GovOps to see aggregate team accuracy trends (not individual breakdowns unless the analyst has opted into full sharing) and identify systemic forecasting gaps.

---

## 3. What the Championship Is NOT

The Championship is not, and must not be used as:

- **A performance evaluation tool.** Championship rankings do not represent the full scope of an analyst's work and are not a valid basis for performance assessment.
- **A component of annual performance reviews.** Championship data must not appear in any formal performance review document, form, or discussion — in whole, in part, or by inference.
- **A basis for promotion or compensation decisions.** No Championship metric — rank, points total, accuracy score, or relative standing — may be used as a factor in promotion decisions, compensation adjustments, or bonus determinations.
- **A basis for disciplinary action.** A low Championship ranking, a decline in Championship score, or a period of below-average override accuracy must never be cited in disciplinary proceedings, performance improvement plans, or any HR process.
- **A ranking visible to HR.** HR personnel have no access to Championship data in any form. Requests from HR for Championship data must be refused and escalated to the GovOps Lead and Legal.
- **A ranking visible to leadership above direct team lead level** without the analyst's explicit consent. Leadership and Sponsor roles see only team-aggregate MAPE — not individual Championship points or rankings.

---

## 4. Access Control Policy

Access to Championship data is governed by role and analyst opt-in status.

### 4.1 Access Tiers

| Role | What They Can See | Conditions |
|---|---|---|
| **Analyst (own data)** | Full personal history: all cycles, override details, accuracy scores, trend charts, Championship points earned | Always; not affected by opt-out (personal history remains visible to self) |
| **Analyst (peers)** | Full Championship Table: name, current rank, aggregate points, accuracy tier | Only for analysts who have not opted out. Opted-out analysts appear as "Anonymous Analyst" |
| **Team Lead** | Team aggregate statistics: team average MAPE, team accuracy trend | Individual analyst breakdowns are hidden unless the analyst has explicitly opted into "Team Lead Sharing" |
| **Team Lead (with analyst consent)** | Individual analyst data for the consenting analyst | Analyst must have enabled "Team Lead Sharing" in their profile settings; setting is revocable at any time |
| **Leadership / Sponsor** | Team aggregate MAPE only — no individual names, no individual Championship points | No exceptions. Leadership with Platform Admin roles cannot self-escalate their Championship data access |
| **HR** | No access | No exceptions. HR access requests must be escalated to GovOps Lead and Legal |
| **GovOps** | Full access to all Championship data including individual records | Audit purposes only. GovOps personnel with Championship data access must have signed the data steward acknowledgment form |

### 4.2 Access Enforcement
- Role-based access controls are enforced at the API layer, not just the UI. Role elevation attacks (e.g., a leadership user querying the Championship API directly) must return 403 for data above their access tier.
- GovOps access to individual Championship data is logged to the HIBT audit trail.
- Access control configuration changes require GovOps Lead approval.

---

## 5. Opt-Out Rights

Every analyst has the unconditional right to opt out of the Championship's shared visibility features at any time, for any reason or no reason.

### 5.1 What Opt-Out Does
- The analyst's name is removed from all shared Championship views (the Championship Table visible to peers and team leads).
- Their ranking slot is replaced with "Anonymous Analyst" in public views.
- Their Championship points and accuracy scores are excluded from team aggregate calculations shared with leadership.
- Their name and data are not accessible by any other user in the Championship context.

### 5.2 What Opt-Out Does Not Do
- Opt-out does not remove the analyst's personal history from their own view. They can still see all their own data.
- Opt-out does not affect their forecasting workflow in any way.
- Opt-out does not affect their DQ scores, Gate 3 status, or any other platform functionality.
- Opt-out does not remove their data from the HIBT audit trail (which is separate from the Championship display layer and governed by separate retention policies).

### 5.3 Opt-Out Process
Analysts opt out via their Profile Settings in the Pit Wall app. The setting is labeled "Show my name on the Championship Table" and is enabled by default. Toggling it off immediately anonymizes the analyst's entry in all shared views.

### 5.4 Opt-In Restoration
Opt-out is fully reversible. An analyst who has opted out can re-enable visibility at any time via the same Profile Settings toggle. Their historical Championship data reappears under their name immediately upon re-enabling.

### 5.5 Opt-Out is Permanent for HR Access
Even if an analyst opts back into shared visibility, the access control prohibiting HR from viewing Championship data is not affected. HR access is prohibited unconditionally and cannot be changed by analyst opt-in status.

---

## 6. Anti-Gaming Guardrails (Technical)

The Championship scoring system includes the following technical controls to prevent gaming, accidental distortion, or unfair advantages:

### 6.1 Minimum Override Impact Threshold
Only overrides with a net absolute revenue impact of **≥ $10M** (as measured against the final actuals in the cycle) count toward Championship points. Small, trivial overrides do not accumulate points. This prevents a strategy of making many minor overrides to inflate point totals without demonstrating meaningful forecasting judgment.

### 6.2 First-Submission Scoring
When an analyst revises an override within the same cycle, the Championship scoring uses the **first submission** MAPE (the accuracy of the original override decision) — not the revised version. This ensures Championship points reflect forecast judgment at decision time, not the ability to retroactively adjust a position after additional information became available. Revisions are encouraged for accuracy, but they do not improve or worsen the Championship scoring retroactively.

### 6.3 Volume Anomaly Review
If an analyst submits **more than 3× their typical cycle override volume** in a given cycle, their Championship points for that cycle are placed in a **pending review** state. GovOps reviews the override set for patterns consistent with gaming (e.g., many small, offsetting overrides, or timing patterns inconsistent with normal forecasting workflow). Points are released after GovOps confirms the overrides reflect genuine forecasting activity. The analyst is notified that their cycle is under review.

### 6.4 Minimum History Requirement
An analyst must have **at least 3 completed cycles** with Championship-eligible overrides before their name appears on the Championship Table. This prevents rankings from being distorted by single-cycle outliers or new analysts who have not yet established a pattern of override activity.

### 6.5 Score Recalculation and Amendments
If actuals are restated after a cycle closes (due to data corrections), Championship scores for that cycle are recalculated automatically against the restated actuals. Analysts are notified of any score changes resulting from actuals restatements. Score changes from restatements are not retroactively applied to Championship point totals that have already been published — only to scores in the current cycle.

---

## 7. Manager Guidance

### 7.1 Policy Statement for People Managers
All people managers who have access to the Pit Wall platform — at any access tier — must acknowledge and adhere to the following policy:

**The Championship Table is a forecasting recognition tool. It is not a performance management tool. Using Championship data in any performance conversation is a policy violation.**

### 7.2 Examples of Prohibited Language and Actions
The following are explicit examples of prohibited uses of Championship data. This list is illustrative, not exhaustive.

**Prohibited in 1:1s, team meetings, and written communications:**
- "I noticed you dropped in the Championship rankings this cycle — can you explain what happened?"
- "Your Championship score has been declining. I'm concerned about your forecasting quality."
- "Your peer [Name] has a much higher Championship accuracy score than you do."
- "I'm going to include your Championship ranking in your year-end review."
- "The team's average Championship score has improved but yours hasn't kept up."

**Prohibited in formal HR processes:**
- Using Championship rank or score as supporting evidence in a performance improvement plan.
- Citing Championship data in a promotion packet (either to support or to block promotion).
- Referencing Championship data in compensation review documentation.
- Including Championship screenshots or exports in any HR file or system.

**Permitted uses of Championship-related context:**
- Asking an analyst (without reference to rankings) whether they feel they are getting useful feedback from the platform.
- Discussing general forecasting methodology, signal interpretation, or override strategy as part of professional development — without tying the conversation to Championship standings.
- Acknowledging publicly (with the analyst's permission) that they made an accurate override call on a high-visibility nameplate — as genuine recognition, not as a comparative ranking exercise.

### 7.3 Manager Acknowledgment Requirement
All people managers with access to the Pit Wall platform must sign a **Manager Acknowledgment Form** confirming they have read this policy and understand the prohibition on Championship data use in performance management. This acknowledgment is:
- Required before receiving any Pit Wall platform access.
- Renewed annually as part of the governance review cycle.
- Recorded in the GovOps access registry.

Non-acknowledgment results in restricted access (team aggregate view only) until acknowledgment is completed.

### 7.4 Reporting Violations
Any analyst who believes Championship data is being used improperly in a performance context should:
1. Contact the GovOps Lead directly (name/alias in the platform).
2. Contact HR via the standard HR hotline or confidential reporting channel.
3. Contact Legal if they believe a formal employment law issue is implicated.

Reports are treated confidentially. Retaliation against an analyst for reporting a Championship policy concern is itself a policy violation and will be escalated.

---

## 8. Annual Review

### 8.1 Review Cadence
The Championship rules, scoring formula, anti-gaming guardrails, and this HR policy are reviewed **annually** by:
- GovOps Lead
- HR Business Partner
- Forecasting team leads (all)
- A designated analyst representative (rotated annually from the forecasting team)

### 8.2 Review Scope
The annual review evaluates:
- Whether the scoring formula continues to reflect genuine forecasting judgment.
- Whether the minimum impact threshold ($10M) remains appropriate given the scale of forecasts being made.
- Whether the anti-gaming guardrails are being triggered at appropriate rates (too many triggers = threshold too low; no triggers in 12 months = guardrail may not be calibrated correctly).
- Whether any analyst-reported concerns from the prior year indicate policy gaps.
- Whether the access control tiers remain appropriate given changes to the team structure.

### 8.3 Change Notification Policy
Any change to the Championship scoring formula, point calculation methodology, or eligibility rules must be:
- Announced to all analysts at least **one full cycle before taking effect**.
- Summarized in a plain-language change notice in the Pit Wall app notification system.
- Logged as a governance change in the HIBT record.

Retroactive application of scoring formula changes to already-completed cycles is prohibited.

---

## Change Log

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | 2026-05-27 | GovOps Lead (TBD) | Initial draft — full HR policy, access controls, opt-out rights, anti-gaming guardrails, manager guidance, annual review requirements |
