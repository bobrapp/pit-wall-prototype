# Model Cards: LLM Components in Pit Wall v4.0

**Document ID:** GOV-005  
**Version:** 1.0  
**Date:** 2026-05-27  
**Status:** DRAFT — Pending GovOps Lead approval and annual provider confirmation  
**Owner:** GovOps Lead (placeholder) + Platform Architect (placeholder)  
**Related documents:** data-residency-framework.md, incident-severity-matrix.md, hibt-pseudonymization-spec.md, dq-weight-governance.md

---

## Purpose

This document provides model cards for both LLM components used in Pit Wall v4.0. Model cards document a model's intended use, known limitations, failure modes, bias evaluation requirements, and governance obligations. They serve as the authoritative reference for:

- Understanding where model judgment is applied and where it is bounded.
- Identifying failure conditions and their mitigations.
- Ensuring quarterly bias evaluations are conducted against the right strata.
- Maintaining replay determinism via model version pinning.
- Satisfying any audit, regulatory, or internal compliance review of AI-assisted decision-making.

Model cards are living documents. They must be reviewed and updated whenever a model version changes, a new failure mode is identified, or a quarterly bias evaluation reveals a material finding. The Change Log at the bottom of this document tracks all updates.

---

## Model Card 1: Second Opinion Agent — Anthropic Claude Opus 4.7

### 1.1 Overview

| Field | Value |
|---|---|
| **Model name** | Claude Opus 4.7 |
| **Provider** | Anthropic |
| **Role in system** | Second Opinion (SO) Agent — generates deliberately divergent bear-case analysis for Second Opinion challenges |
| **Platform integration point** | SO Service API; invoked when analyst submits a challenge or when Gate 3 triggers an automatic SO review |
| **Model parameters** | Temperature: 0.4 / top_p: 0.95 / max_tokens: 2048 |
| **Training data cutoff** | TBD — to be confirmed with Anthropic at each annual model card review |
| **Version pinning** | `model_id` and provider snapshot hash stored per HIBT run (see section 1.8) |
| **Data residency** | Tier 3 data scrubbed before send; see data-residency-framework.md |

### 1.2 Role in System

The Second Opinion Agent is invoked to generate a structured bear-case analysis challenging the analyst's forecast or the primary model's output. Its output includes:
- An alternative demand scenario with supporting reasoning.
- A set of factors from the signal catalog (or identified as missing from the catalog) that support the bear case.
- A **Material Disagreement Score (MDS)** representing the magnitude of disagreement between the SO analysis and the submitted forecast.

The SO Agent is explicitly prompted to be skeptical and to look for downside risk. This framing is intentional — the SO exists to stress-test optimistic forecasts, not to produce a balanced view. This framing has implications for how its outputs are interpreted (see Known Limitations).

The MDS score feeds into Gate 3 logic: an MDS above the configured threshold blocks the Gate 3 commit until the analyst responds to the SO challenge or a GovOps bypass token (GOT) is issued.

### 1.3 Known Limitations

**Training data cutoff:**  
The model's knowledge has a cutoff date (to be confirmed annually with Anthropic). This means:
- The model may lack knowledge of tariff changes, regulatory shifts, or competitive events that occurred after the cutoff.
- In periods of rapid external change (e.g., new tariff schedules, sudden competitive entries), the SO analysis may underestimate risks that a human analyst with current market knowledge would identify.
- Mitigation: the signal catalog provides real-time structured data. Analysts should treat the SO analysis as one analytical lens, not an authoritative source on current events.

**Bear-case framing bias:**  
The model is explicitly prompted to take a skeptical, downside-focused stance. This serves the SO's purpose but creates a systematic bias: the model will tend to over-weight downside scenarios in ambiguous situations, particularly when signal quality is mixed. In strongly positive market conditions where upside risk is more material than downside risk, SO output may be less useful. Analysts should factor this framing into how they respond to SO challenges.

**No access to internal actuals:**  
The model has no access to GM internal historical actual volumes, revenue, or other proprietary data. All SO reasoning is based exclusively on the signals provided in the current request payload. Historical patterns cited by the model are derived from public sources in its training data, not from GM-internal forecasting history. This limits the model's ability to assess whether a forecast deviation is within historical norms for a specific nameplate or program.

**Factor hallucination risk:**  
Without a grounding check, the model may cite factors — macroeconomic indicators, competitive events, regulatory changes — that are not present in the current signal catalog. A hallucinated factor that sounds plausible may be accepted uncritically by an analyst who is not closely familiar with the catalog. The grounding check (see Failure Modes) is the technical control for this risk, but it operates post-generation; if the grounding check is bypassed or fails, hallucinated factors could reach the analyst.

### 1.4 Failure Modes

| Failure Mode | Detection Method | System Response |
|---|---|---|
| **Provider timeout / unavailability** | SO API returns timeout or 5xx after retry exhaustion | SO service returns `status: unavailable` for the request. MDS score is set to `null`. Gate 3 is automatically unblocked for affected nameplates with annotation `GOT-03: LLM_PROVIDER_OUTAGE`. Incident triggers P1 or P2 per incident-severity-matrix.md |
| **Factor hallucination** | Grounding check validator compares cited factors against signal catalog. Factors not present in catalog are flagged. | Hallucinated factors are quarantined from the displayed SO analysis. Analyst sees a warning badge: "X factor(s) could not be verified against signal catalog — excluded from MDS calculation." The MDS is recalculated excluding hallucinated factors. |
| **Response repetition / degeneration** | Response validator checks for token repetition ratio, response coherence score, and minimum factor diversity (≥3 distinct factors cited) | Degenerate responses are rejected before MDS calculation. SO service retries once. If second attempt also degenerates, the request fails gracefully (same path as provider timeout). |
| **Context window overflow** | Request payload exceeds 2048 tokens after signal data is formatted | Signal data is truncated to the most recently updated signals, preserving Gate 3 relevant signals (per a defined priority ranking). Truncation is logged to HIBT with the list of omitted signals. |
| **MDS calculation anomaly** | MDS score jumps >20pp from prior calculation on unchanged signal data (detected by the SO anomaly monitor) | Alert fires to `#pit-wall-ops`. GovOps reviews before MDS is surfaced to analyst. This may indicate a `GATE3_SO_FALSE_BLOCK` scenario — see incident-severity-matrix.md section 4.2. |

### 1.5 Bias Evaluation Requirements

**Evaluation frequency:** Quarterly.

**Evaluation strata:**
The SO Agent must be evaluated for systematic under- or over-estimation bias across the following strata:

| Stratum Category | Strata |
|---|---|
| Vehicle segment | Truck, EV (Battery Electric), SUV, Car/Sedan, Commercial/Fleet |
| Region | Northeast, Southeast, Midwest, Southwest, West, Canada |
| Cycle phase | Early cycle (first 30% of planning year), Mid-cycle (31–70%), Late cycle (71–100%) |

**Bias metric:** MAPE delta — the difference in Mean Absolute Percentage Error between the SO model's bear-case and realized actuals, computed separately for each stratum and compared across strata.

**Bias threshold:** A MAPE delta exceeding **2 percentage points** between any two strata (e.g., Truck MAPE delta = 8%, EV MAPE delta = 4% = 4pp gap → triggers recalibration) must trigger a formal recalibration review.

**Recalibration trigger actions:**
1. GovOps Lead is notified of the bias finding.
2. A calibration review is opened with the Platform Architect and forecasting team leads.
3. If bias is confirmed after review, options include: prompt modification to reduce the bias, model version change, or supplementary guidance to analysts for the affected stratum.
4. Findings and actions are logged to HIBT as a `MODEL_BIAS_REVIEW` event.
5. If bias is not resolved within 1 quarter, it is escalated to VP NAMA as a model governance concern.

**Bias evaluation protocol:** See section 4 of this document.

### 1.6 Version Pinning and Replay Determinism

Every HIBT run record that involved an SO Agent invocation must include:
- `so_model_id`: the exact model identifier used (e.g., `claude-opus-4-7-20260101`).
- `so_provider_snapshot_hash`: a hash of the provider-confirmed model snapshot, obtained from Anthropic's model versioning API or equivalent confirmation mechanism.
- `so_request_id`: the unique request ID returned by the Anthropic API for the call.
- `so_weight_version_id`: the DQ weight version in effect at the time of the SO call (FK to `dq_weight_versions`).

When a historical cycle is replayed, the replay engine uses the `so_model_id` from the original run. If the exact model version is no longer available from the provider, the replay is flagged as `APPROXIMATE_REPLAY` in the HIBT record and cannot be used as evidence in a formal audit.

Model version pinning requirements are reviewed with Anthropic annually to ensure continued availability of historical model versions.

### 1.7 Data Handling

Per data-residency-framework.md:
- **Tier 1 data** (aggregated, anonymized): may be included in SO request payloads.
- **Tier 2 data** (nameplate-level, non-attributable): may be included with standard encryption in transit.
- **Tier 3 data** (individually attributable, financial, or competitively sensitive): must be scrubbed from all SO request payloads before transmission to Anthropic's API.

The SO request formatter includes a Tier 3 scrubbing pass before API call. Scrubbing is logged (not the scrubbed content, only the count and categories of fields removed) to the HIBT record. A scrubbing failure (error in the scrubbing pass) must halt the SO call — never fall through to sending unscrubbed data.

---

## Model Card 2: Primary Forecast Model — OpenAI GPT-4o

### 2.1 Overview

| Field | Value |
|---|---|
| **Model name** | GPT-4o |
| **Provider** | OpenAI (via Azure OpenAI Service) |
| **Role in system** | Primary forecast generation support and AI Chat responses |
| **Platform integration point** | Forecast service (primary model calls); AI Chat service (analyst Q&A interface) |
| **Model parameters** | Temperature: 0.2 / top_p: 0.9 |
| **Training data cutoff** | TBD — to be confirmed with OpenAI / Microsoft Azure at each annual model card review |
| **Version pinning** | Deployment name + Azure model version stored per HIBT run (see section 2.8) |
| **Data residency** | Azure OpenAI Service used specifically for data residency compliance; see data-residency-framework.md for region configuration |

### 2.2 Role in System

GPT-4o serves two roles in Pit Wall v4.0:

**Forecast generation support:** The primary model assists in generating forecast narratives, summarizing signal data, and producing structured forecast inputs that analysts review and override. It operates at a lower temperature (0.2) than the SO Agent to produce more consistent, less divergent outputs.

**AI Chat:** The conversational interface that allows analysts to ask natural language questions about the current cycle's data, signal trends, DQ scores, and forecast rationale. Chat responses are generated by GPT-4o with the current cycle context injected into the prompt.

### 2.3 Known Limitations

**Training data cutoff:**  
Same constraint as the SO Agent — knowledge cutoff applies, and current-events reasoning should be supplemented with signal data rather than relied upon from model training.

**Anchoring bias:**  
As the primary forecast model, GPT-4o is exposed to prior cycle forecast data as part of its context window. This creates a risk of anchoring — the model may reinforce prior cycle forecasts too strongly rather than updating appropriately to new signal data. This bias is most pronounced in cycles where signal data has changed materially but the model's output remains close to prior cycle numbers. Analysts should be aware that a GPT-4o forecast that closely matches the prior cycle may reflect anchoring rather than genuine signal-driven forecasting.

**Authoritative-sounding Chat responses:**  
GPT-4o produces fluent, confident-sounding text. In the AI Chat context, this means responses may sound authoritative even when the underlying signal quality is low (e.g., low DQ score, stale data, incomplete lineage). Analysts may interpret confident-sounding language as an indicator of reliable data, when in fact the model has no direct knowledge of data quality.

Mitigation: The AI Chat interface **must always** surface the current DQ score and data freshness context inline with any response that references forecast data. The prompt template for AI Chat includes a mandatory DQ context injection: `[DQ Score: X.XX | Freshness: Y days | Lineage: Z%]` prepended to all responses touching forecast data. This is a technical requirement, not a UI suggestion.

**No awareness of analyst override history:**  
GPT-4o does not have access to individual analyst override patterns or Championship scores. It cannot evaluate whether an analyst's proposed override is consistent with their historical judgment. This is intentional (privacy and anti-bias design) but means the model cannot provide personalized calibration feedback.

### 2.4 Failure Modes

| Failure Mode | Detection Method | System Response |
|---|---|---|
| **Provider timeout / unavailability (Azure)** | API returns timeout or 5xx after retry exhaustion | Same graceful degradation path as SO Agent. Forecast service returns `status: unavailable`. AI Chat returns a user-facing message: "AI Chat is temporarily unavailable. Please use the manual forecast interface." Incident triggers P1 or P2 per incident-severity-matrix.md. |
| **Anchored forecast detected** | Drift detector compares GPT-4o output against prior cycle for nameplates where signal delta exceeds threshold. If output delta < 50% of signal delta, an anchoring flag is set. | Anchoring flag surfaced to analyst as a soft warning: "This forecast is close to the prior cycle. Signals suggest a larger adjustment may be warranted." Flag does not block submission. |
| **Low DQ context response** | AI Chat response references forecast data while DQ score is below 0.60 threshold | DQ context injection includes a prominent warning: "Data quality for this forecast is below threshold (DQ: X.XX). Treat this response with additional caution." |
| **Context window overflow** | Prompt exceeds model context limit | Oldest cycle context is pruned first. Current cycle signals are always retained. Pruning is logged to HIBT. |

### 2.5 Bias Evaluation Requirements

**Evaluation frequency:** Quarterly (same cadence as SO Agent).

**Evaluation strata:** Same as SO Agent — vehicle segment, region, cycle phase (see Model Card 1 section 1.5).

**Bias metric:** MAPE delta across strata, same methodology as SO Agent.

**Bias threshold:** Same 2pp MAPE delta threshold across strata.

**Additional consideration for anchoring bias:** The quarterly evaluation must include a specific test for anchoring bias: for cycles where signal data changed materially (>10% delta in key signals), compare GPT-4o forecast output delta against signal delta. Anchoring bias is confirmed if the output delta is consistently less than 50% of the signal delta across a stratum.

**Evaluation protocol:** See section 4 of this document.

### 2.6 Azure OpenAI Data Residency Configuration

GPT-4o is accessed via Azure OpenAI Service, not directly via OpenAI's API, specifically to satisfy data residency requirements. Configuration requirements:
- The Azure OpenAI deployment region must match the data residency requirement for the data being processed (see data-residency-framework.md for region-to-data-tier mapping).
- Deployment names and region configurations are treated as security-relevant configuration — changes require GovOps Lead approval.
- The Azure subscription and resource group must be reviewed annually to confirm they are covered by the organization's Microsoft data processing agreement.

### 2.7 AI Chat-Specific Controls

In addition to the general controls above, the AI Chat implementation must enforce:
- **Session isolation:** Each analyst chat session is isolated. One analyst cannot access another's chat history or prompt another's model session.
- **No persistent chat memory across sessions:** Chat context does not persist between sessions. Each new session starts fresh with only the current cycle context injected. This prevents cross-session data leakage.
- **Audit logging:** All AI Chat prompts and responses are logged to the HIBT audit trail (with Tier 3 scrubbing applied to prompts before storage). This enables review of Chat interactions in the context of governance investigations.
- **Prohibited response categories:** The Chat prompt template includes a system-level instruction prohibiting the model from: providing forecasting advice that references analyst identity, comparing individual analyst performance, or making statements about HR or performance management topics.

### 2.8 Version Pinning and Replay Determinism

Every HIBT run record involving a GPT-4o call must include:
- `primary_model_deployment_name`: the Azure OpenAI deployment name (which maps to a specific model version).
- `primary_model_api_version`: the Azure OpenAI API version string.
- `primary_model_request_id`: the unique request ID from the Azure API response.

AI Chat interactions are also logged but with lower replay fidelity requirements — Chat is an advisory interface, not a decision record. Chat logs are retained for audit purposes but are not required to be fully replayable.

---

## 3. Shared Governance Requirements

### 3.1 Annual Model Card Review
Both model cards must be reviewed annually by the GovOps Lead and Platform Architect. The review must:
- Confirm or update the training data cutoff from each provider.
- Assess whether any new failure modes have been observed in production.
- Review the most recent quarterly bias evaluation results.
- Confirm that version pinning mechanisms are functioning correctly.
- Update data handling requirements if data-residency-framework.md has changed.

### 3.2 Model Version Change Protocol
When either model is upgraded to a new version:
1. A model card update is required before the new version is deployed to production.
2. The new version must pass the full eval harness (including Eval Gate 6 — bias evaluation) before GA.
3. Version pinning must be verified with the new model version.
4. A `MODEL_VERSION_CHANGE` event is logged to HIBT.
5. For the SO Agent: the new version must be confirmed with Anthropic as covered by the existing data processing agreement before deployment.

---

## 4. Bias Evaluation Protocol

This section describes the standard methodology for the quarterly bias evaluation applied to both models.

### 4.1 Sample Selection
1. From the most recently closed cycle, randomly sample **100 override outcomes** where the model's forecast was materially different from the analyst's override (>5% delta). If fewer than 100 such overrides exist, include all available overrides for the cycle.
2. Confirm that actuals are available for all sampled overrides. Overrides without confirmed actuals are excluded from the evaluation.

### 4.2 Stratification
Stratify the 100 sampled overrides by:
- **Vehicle segment:** Truck, EV, SUV, Car/Sedan, Commercial/Fleet.
- **Region:** Northeast, Southeast, Midwest, Southwest, West, Canada.
- **Cycle phase:** Early (first 30%), Mid (31–70%), Late (71–100%).

Each override falls into one cell of this three-dimensional matrix. Cells with fewer than 5 samples are noted but not excluded — the small-sample caveat is flagged in the evaluation report.

### 4.3 MAPE Calculation
For each stratum, compute:
- **Model MAPE:** Mean Absolute Percentage Error between the model's forecast and realized actuals, across all overrides in the stratum.
- **Override MAPE:** Mean Absolute Percentage Error between the analyst's override and realized actuals, across all overrides in the stratum (for context — this is not the bias metric, but it provides a useful comparison).

### 4.4 Cross-Stratum Comparison
For each dimension (segment, region, cycle phase), compute the MAPE delta: the difference between the highest-MAPE stratum and the lowest-MAPE stratum within that dimension.

Example:
```
Segment MAPE:
  Truck:    6.2%
  EV:       4.1%
  SUV:      5.8%
  Car:      4.5%
  Commercial: 7.3%

Max MAPE delta (segment): 7.3% - 4.1% = 3.2pp  ← EXCEEDS 2pp threshold
```

A MAPE delta exceeding **2pp** in any dimension triggers the recalibration workflow (see section 1.5).

### 4.5 Documentation
Each quarterly bias evaluation produces a **Bias Evaluation Report** that includes:
- Evaluation date and cycle covered.
- Sample size and exclusions.
- MAPE table per stratum.
- MAPE delta per dimension.
- Pass/fail status against the 2pp threshold.
- Recommended actions if threshold is exceeded.
- Sign-off: Platform Architect + GovOps Lead.

Reports are stored in the governance document repository and linked to the relevant HIBT `MODEL_BIAS_REVIEW` event.

---

## 5. Eval Gate 6: Bias Evaluation Gate

The standard eval harness for Pit Wall v4.0 includes five gates (calibration, accuracy, latency, adversarial robustness, data quality). Bias evaluation is added as the **sixth gate (Eval Gate 6)**. No LLM model version may be cleared for General Availability (GA) without passing Eval Gate 6.

### 5.1 Gate 6 Definition

**Name:** Bias Evaluation Gate  
**Trigger:** Required before any new model version (major or minor) is promoted to production for either the SO Agent or the Primary Forecast Model.  
**Method:** Full bias evaluation protocol (section 4 above), conducted on a held-out evaluation dataset (not the most recent live cycle, to prevent data leakage between evaluation and deployment decisions).

### 5.2 Gate 6 Pass Criteria
The model version passes Eval Gate 6 if and only if:
- MAPE delta across all vehicle segment strata is **< 2pp**.
- MAPE delta across all region strata is **< 2pp**.
- MAPE delta across all cycle phase strata is **< 2pp**.

All three conditions must be met. Failing any single condition fails the gate.

### 5.3 Gate 6 Failure Handling
If a new model version fails Eval Gate 6:
1. The version is not deployed to production.
2. The failure is documented in the model card update for that version.
3. The Platform Architect investigates the source of the bias and either:
   - Works with the provider to understand if a prompt engineering adjustment can reduce the bias, OR
   - Identifies a different model version that passes the gate.
4. The current production version remains active until a compliant replacement passes Eval Gate 6.
5. If no compliant replacement is available within 90 days of a known model deprecation, the GovOps Lead escalates to VP NAMA for a risk-acceptance decision.

### 5.4 Gate 6 Documentation
Gate 6 results are documented in:
- The model card (this document) under the Change Log.
- The eval harness run record in the HIBT.
- The model version change record.

---

## Change Log

| Version | Date | Author | Description |
|---|---|---|---|
| 1.0 | 2026-05-27 | GovOps Lead (TBD) | Initial draft — model cards for Claude Opus 4.7 and GPT-4o, bias evaluation protocol, Eval Gate 6 definition |
