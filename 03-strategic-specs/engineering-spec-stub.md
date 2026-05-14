# NAMA Pit Wall v3.0 — Engineering Spec Stub

> Companion engineering specification stub for the v3.0 Delighters PRD addendum. Architecture overview, API contract changes, data-model deltas, infrastructure investments, build effort estimates, and observability plan for Second-Opinion Agent, Ghost Lap, and Championship Table. Stub depth — enough for eng leads to scope sprints; not a full implementation guide.

## NAMA Pit Wall · v3.0 Engineering Specification Stub

**Version:** 1.0
**Date:** 2026-05-12
**Status:** Stub for engineering scoping
**Companion to:** NAMA Pit Wall v3.0 — Delighters PRD Addendum
**Engineering lead:** Mansoor Alghooneh + Govinda Chaluvadi
**Architect:** Bob Rapp

### Purpose of this document

This is a **stub** — not a full engineering specification. It exists so engineering leads can:

1. Understand the v3.0 architecture in one read
2. See the API contract changes and data-model deltas
3. Estimate build effort across the four work-streams
4. Identify the staffing gap (there is one)
5. Hand it off to feature teams for full per-feature design docs

For the **why** behind each requirement, read the [Delighters PRD Addendum](#). This doc only covers the **how**.

### Scope

**In scope:**

- High-level architecture (one diagram, layered)
- API contract changes (new endpoints, new events)
- Data-model deltas (new tables, modified fields)
- Infrastructure investments (new services, hardening, capacity)
- Per-feature engineering spec at stub depth
- Build effort estimates (engineer-weeks by role) + staffing-gap callout
- Observability + SLO plan
- Critical-path sequencing

**Out of scope (deferred to per-feature design docs):**

- Detailed sequence diagrams
- Schema migration scripts
- Specific compute sizing (RAM, vCPU, IOPS)
- Cost projections at run-rate
- Disaster recovery playbooks
- Specific UI component implementations
- Test-coverage targets (covered by eval gates in PRD)

### Sign-off chain

| Phase | Signer | Artifact |
| --- | --- | --- |
| Spec stub ratification | Bob Rapp + Mansoor + Govinda + Don S. | This document |
| Per-feature design doc | Feature owner | Sep doc per feature |
| API contract review | Govinda C. | API freeze ticket |
| Capacity sign-off | Mansoor A. | Capacity plan |
| Production cutover | Govinda C. + Don S. | Cutover ticket |

### Key engineering decisions baked in

1. **Second-Opinion runs in a dedicated service**, not as a config variant of the primary agent. Rationale: blast-radius isolation, independent eval lifecycle, separate budget tracking.
2. **Ghost Lap data is nightly-precomputed** with hot-path cache, not real-time. Rationale: query latency budget (2s p95) cannot tolerate live aggregation across 24 cycles of lineage.
3. **Championship scoring reads from HIBT only**, never maintains a separate ledger. Rationale: replay-from-source as the single source of truth; no drift between leaderboard and reality.
4. **All three features sit behind kill-switch feature flags**. Rationale: 60-second incident response requirement (PRD CC-6).
5. **HIBT v2.0 is the single critical-path dependency.** If HIBT v2.0 slips, all three features slip. There is no parallel path.

### Companion artifacts

- [NAMA Pit Wall v3.0 — Delighters PRD Addendum](#) (the why)
- [NAMA Pit Wall v2.4 application](#) (the substrate being extended)
- [NAMA Pit Wall — Sponsor Review Deck v2.4](#) (executive context)
- [NAMA Pit Wall — Executive One-Pager v2.4](#) (the elevator summary)

## Architecture overview

### Stack diagram (v2.4 baseline + v3.0 additions)

```
┌─────────────────────────────────────────────────────┐
│  LAYER D · PERSONA SURFACES  (existing + 4 new hooks)            │
│                                                                  │
│  Workbench  Outlook  Teams  Excel  SharePoint  PBI  Glean  HIBT  │
│     │         │       │                             │            │
│     +-- Second-Opinion panel             +-- Ghost-issue badge   │
│     +-- Ghost-Lap overlay                +-- Championship widget │
│     +-- Championship page                                        │
│     +-- Lap-clap button                                          │
└─────────┬─────────────────────────────────────────────────┘
          │
          v
┌─────────────────────────────────────────────────────┐
│  LAYER C · ACCESS API + EVENTS  (existing + 3 endpoints + 3 evt) │
│                                                                  │
│  Existing v2.4:                                                  │
│    POST  /forecasts/:id/overrides                                │
│    POST  /forecasts/:id/approvals                                │
│    GET   /forecasts/:id/replay                                   │
│    GET   /forecasts/:id                                          │
│                                                                  │
│  v3.0 additions:                                                 │
│    POST  /forecasts/:id/second-opinion           (new)           │
│    GET   /forecasts/:id/ghost-lap                (new)           │
│    GET   /championship/:season                   (new)           │
│                                                                  │
│  New event types:                                                │
│    second-opinion.raised                                         │
│    ghost-issue.detected                                          │
│    championship.season-closed                                    │
└─────────┬─────────────────────────────────────────────────┘
          │
          v
┌─────────────────────────────────────────────────────┐
│  LAYER B · PROCESS ENGINE  (existing + 3 new services)           │
│                                                                  │
│  Existing:                                                       │
│    state-machine · trust-scoring · approval-routing              │
│    workbench-anomaly v3.5 · narrative-drafter v2.3               │
│    intake-agent v1.9 · glean-copilot v2.7 · guardrail-classifier │
│                                                                  │
│  v3.0 new services:                                              │
│    ┌────────────────────┐  ┌────────────────┐  ┌────────────┐ │
│    │ second-opinion-svc │  │  ghost-lap-svc   │  │  champ-svc │ │
│    │ (agent + router)  │  │ (classifier+UI) │  │ (scoring)  │ │
│    └─────┬──────────┘  └─────┬─────────┘  └────┬──────┘ │
└───────────┬────────────────┬─────────────────│────────────────┘
            v                  v                  v
┌─────────────────────────────────────────────────────┐
│  LAYER A · PLANNING FABRIC  (Databricks + Unity Catalog)         │
│                                                                  │
│  Existing tables (v2.4):                                         │
│    forecast_sets · number_objects · scenarios · constraint_links │
│    overrides · challenges · approvals · trust_metadata           │
│                                                                  │
│  v3.0 new tables (10):                                           │
│    second_opinion_runs · disagreement_scores · so_dismissals     │
│    ghost_lap_projections · recurring_challenges                  │
│    override_outcomes                                             │
│    championship_seasons · championship_scores · lap_claps        │
│    visibility_preferences                                        │
└─────────┬─────────────────────────────────────────────────┘
          │
          v
┌─────────────────────────────────────────────────────┐
│  HIBT REPLAY-PROMPT-LEDGER v2.0  (CRITICAL PATH for v3.0)        │
│                                                                  │
│  Captures: every prompt, tool call, override, approval, score   │
│  Stores:   24+ months immutable history                         │
│  Queries:  replay-by-action-id · drift-by-version                │
│                                                                  │
│  v3.0 read paths:                                                │
│    second-opinion-svc → replay-from-source                       │
│    ghost-lap-svc → 24-cycle historical projection                │
│    champ-svc → score recomputation                               │
└─────────────────────────────────────────────────────┘
```

### What is new vs. modified

- **3 new services** (second-opinion-svc, ghost-lap-svc, champ-svc) live in Layer B alongside existing agents.
- **3 new API endpoints** in Layer C, all non-breaking additions.
- **3 new event types** in Layer C event bus, all additive.
- **10 new tables** in Layer A, all additive (no schema changes to existing tables).
- **4 new persona-surface integrations** in Layer D, all opt-in via feature flag.
- **1 critical dependency**: HIBT v2.0 must be GA before any v3.0 feature can go to P4.

### What stays exactly the same

- Layer A existing tables (no migrations)
- Layer B existing services (workbench-anomaly, narrative-drafter, intake-agent, glean-copilot, guardrail-classifier) — unchanged
- Layer C existing API contract — strictly non-breaking
- Layer D existing surface integrations — unchanged
- v2.4 self-tests — must continue to pass post-deployment (regression gate)

## API contract changes

All v3.0 changes are **non-breaking additions**. No existing endpoint, response shape, or event type is modified.

### New endpoint 1 · POST /forecasts/:id/second-opinion

**Purpose:** Invoke a Second-Opinion Agent run on the specified forecast set.

**Request:**

```json
{
  "trigger": "manual" | "auto_gate3",
  "context": {
    "override_draft_id": "od_2026q3_silv_001",   // optional
    "approval_card_id": "ac_2026q3_001",         // optional
    "scenario_id": "sc_base_2026q3"               // required
  },
  "prompt_pack": "divergent_v1",                  // server-selected if omitted
  "max_latency_ms": 90000,                        // soft cap
  "async": true                                   // streaming results recommended
}
```

**Response (async, with streaming progress):**

```json
{
  "run_id": "so_run_abc123",
  "status": "running" | "completed" | "failed",
  "started_at": "2026-05-12T14:30:00Z",
  "completed_at": "2026-05-12T14:31:18Z",
  "primary": { "value": 312400, "p10": 287600, "p90": 338900 },
  "second_opinion": { "value": 304200, "p10": 281400, "p90": 328500 },
  "delta": -8200,
  "mds": 0.42,                                    // material-disagreement score
  "source_overlap_pct": 38,
  "divergent_factors": [
    { "factor": "incentive_elasticity", "weight": 0.34, "category": "pricing" },
    { "factor": "texas_dealer_pulse", "weight": 0.28, "category": "mia" },
    { "factor": "sierra_hd_cross_shop", "weight": 0.19, "category": "mia" }
  ],
  "suggested_route": { "sme_team": "mia", "specific_sme": "jim_kyle" },
  "challenge_raised": true,
  "challenge_id": "ch_so_2026q3_001",
  "hibt_entry_id": "hibt_42abf2",
  "cost_usd": 0.18
}
```

### New endpoint 2 · GET /forecasts/:id/ghost-lap

**Purpose:** Retrieve precomputed ghost-lap projection for the specified forecast set.

**Request:** Query params `?cycle_offset=1&include_actuals=true&seat=analyst`

**Response:**

```json
{
  "forecast_set_id": "FS-2026Q3-NA-TRK-001",
  "current_cycle": { "id": "2026-05A", "closed_at": null },
  "prior_cycle": {
    "id": "2026-04A",
    "closed_at": "2026-04-22T19:00:00Z",
    "baseline": [98.1, 102.4, 108.7, /* ... 9 months */],
    "consensus": [98.1, 102.4, 108.7, /* ... 9 months */],
    "p10": [95.0, 99.0, /* ... */],
    "p90": [101.2, 105.6, /* ... */],
    "actual": [98.1, 102.4, 108.7, 106.2, 104.9, null, null, null, null],
    "committed_value": 320500,
    "actual_at_horizon": 304200
  },
  "accuracy_delta": {
    "this_cycle_mape": 8.2,
    "prior_cycle_mape": 9.4,
    "lift": 1.2,
    "per_month_deltas": [/* signed deltas */]
  },
  "recurring_issues": [
    {
      "id": "ghost_jim_silvHD_R18",
      "sme": "jim_kyle",
      "reason_code": "R-18",
      "nameplate": "silverado_hd",
      "cycles_open": 3,
      "last_resolution": null,
      "first_raised_cycle": "2026-03A"
    }
  ],
  "override_outcomes": [
    {
      "current_override_id": "od_2026q3_silv_001",
      "similar_prior_override_id": "od_2026q2_silv_007",
      "similarity_score": 0.89,
      "prior_outcome": "correct" | "overruled" | "cycled" | "dismissed"
    }
  ],
  "cache_age_seconds": 14400,
  "hibt_lineage_id": "hibt_gl_2026q3"
}
```

### New endpoint 3 · GET /championship/:season

**Purpose:** Retrieve the championship standings for the specified season, scoped to the requesting user's decision-rights.

**Request:** Query params `?league=override_value_add&league=challenge_precision`

**Response:**

```json
{
  "season": "2026-Q4-grand-prix",
  "season_type": "quarterly" | "monthly",
  "window": { "opens_at": "2026-10-01T00:00:00Z", "closes_at": "2026-12-31T23:59:59Z" },
  "viewer_seat": "analyst",
  "viewer_opted_in": true,
  "leagues": {
    "override_value_add": {
      "viewer_position": { "quartile": 2, "rank": 7, "of": 24, "score": 8.4 },
      "public_leaderboard": [
        { "rank": 1, "user": "krisztina_g", "score": 14.2, "opted_in": true },
        { "rank": 2, "user": "AGGREGATE", "score": 12.8, "opted_in": false },
        { "rank": 3, "user": "alex_p", "score": 11.6, "opted_in": true }
      ]
    },
    "challenge_precision": { /* ... */ },
    "agent_improvement": { /* ... */ },
    "mentorship": { /* ... */ }
  },
  "viewer_history": {
    "q1_2026": 6.2,
    "q2_2026": 7.1,
    "q3_2026": 7.9,
    "q4_2026": 8.4
  },
  "lap_claps": { "given_this_season": 3, "received_this_season": 7, "cap_given": 5, "cap_received": 20 }
}
```

### New event types

**`second-opinion.raised`** — emitted when MDS ≥ 0.3 and a challenge is raised

```json
{
  "type": "second-opinion.raised",
  "emitted_at": "2026-05-12T14:31:18Z",
  "forecast_set_id": "FS-2026Q3-NA-TRK-001",
  "run_id": "so_run_abc123",
  "mds": 0.42,
  "challenge_id": "ch_so_2026q3_001",
  "route": { "sme_team": "mia", "specific_sme": "jim_kyle" }
}
```

**`ghost-issue.detected`** — emitted nightly when recurring-challenge threshold tripped

```json
{
  "type": "ghost-issue.detected",
  "emitted_at": "2026-05-12T06:00:00Z",
  "ghost_id": "ghost_jim_silvHD_R18",
  "sme": "jim_kyle",
  "reason_code": "R-18",
  "nameplate": "silverado_hd",
  "cycles_open": 3,
  "forecast_set_id": "FS-2026Q3-NA-TRK-001"
}
```

**`championship.season-closed`** — emitted at Gate 3 commit for monthly micros and at quarter-end for Grand Prix

```json
{
  "type": "championship.season-closed",
  "emitted_at": "2026-06-30T23:59:59Z",
  "season": "2026-Q2-grand-prix",
  "season_type": "quarterly",
  "podium": {
    "override_value_add": ["krisztina_g", "alex_p", "jordan_m"],
    "challenge_precision": ["jim_kyle", "pat_l", "diane_s"],
    "agent_improvement": ["don_s", "bob_rapp"],
    "mentorship": ["krisztina_g", "jim_kyle"]
  }
}
```

### Versioning + back-compat

- All new endpoints versioned at `/api/v2/...` alongside existing endpoints
- No existing endpoint signatures change
- Event bus consumers MUST tolerate unknown event types (ignore-by-default policy, already in v2.4)
- All new endpoints respect existing auth, rate-limit, and decision-rights middleware

## Data-model deltas

Ten new tables. Zero schema changes to existing tables. All new tables follow v2.4 conventions: `id` UUIDv7, `created_at` / `updated_at` audit columns, soft-delete flag, HIBT-lineage FK.

### second_opinion_runs

One row per Second-Opinion invocation.

```ts
{
  id:                 string,        // uuid v7
  forecast_set_id:    string,        // FK forecast_sets
  trigger:            'manual' | 'auto_gate3',
  triggered_by:       string,        // user_id or 'system'
  prompt_pack:        string,        // e.g. 'divergent_v1'
  primary_value:      number,
  second_value:       number,
  primary_p10:        number,
  primary_p90:        number,
  second_p10:         number,
  second_p90:         number,
  mds:                number,        // 0..1
  source_overlap_pct: number,        // 0..100
  cost_usd:           number,
  latency_ms:         number,
  status:             'running' | 'completed' | 'failed',
  challenge_id:       string | null, // FK challenges (if raised)
  hibt_entry_id:      string,        // FK hibt_entries
  created_at:         timestamp,
}
```

### disagreement_scores

One row per divergent-factor in a second-opinion run (1–N relation to `second_opinion_runs`).

```ts
{
  id:                 string,
  run_id:             string,        // FK second_opinion_runs
  factor:             string,        // e.g. 'incentive_elasticity'
  category:           'pricing' | 'mia' | 'ops' | 'tariff' | 'competitive',
  weight:             number,        // 0..1 contribution to MDS
  evidence_links:     string[],      // SharePoint paths
  created_at:         timestamp,
}
```

### so_dismissals

One row per dismissed second-opinion challenge.

```ts
{
  id:                 string,
  run_id:             string,        // FK second_opinion_runs
  dismissed_by:       string,        // user_id
  reason_code:        'DISM-1' | 'DISM-2' | 'DISM-3',
  note:               string,
  hibt_entry_id:      string,
  created_at:         timestamp,
}
```

### ghost_lap_projections

Nightly-precomputed projection of prior cycle's forecast layered onto current cycle's horizon. One row per (forecast_set, current_cycle, prior_cycle_offset).

```ts
{
  id:                  string,
  forecast_set_id:     string,       // FK forecast_sets
  current_cycle_id:    string,
  prior_cycle_offset:  number,       // 1 = last cycle, 2 = two cycles ago, ...
  prior_cycle_id:      string,
  baseline_series:     number[],     // P50 model output by month
  consensus_series:    number[],     // override line by month
  p10_series:          number[],
  p90_series:          number[],
  actual_series:       (number | null)[],
  committed_value:     number,
  actual_at_horizon:   number | null,
  mape_current:        number,       // computed for accuracy delta
  mape_prior:          number,
  computed_at:         timestamp,    // nightly job timestamp
  ttl_seconds:         number,       // cache expiry
  hibt_lineage_id:     string,
}
```

### recurring_challenges

One row per (SME, reason_code, nameplate) triple meeting recurring threshold.

```ts
{
  id:                  string,       // e.g. 'ghost_jim_silvHD_R18'
  sme:                 string,       // user_id
  reason_code:         string,       // FK reason_codes
  nameplate:           string,
  cycles_open:         number,       // consecutive cycles raised
  first_raised_cycle:  string,
  last_raised_cycle:   string,
  last_resolution:     'resolved' | 'overruled' | null,
  status:              'active' | 'resolved' | 'archived',
  detected_at:         timestamp,
  resolved_at:         timestamp | null,
}
```

### override_outcomes

One row per override after its forecast horizon elapses, linking back to actuals.

```ts
{
  id:                   string,
  override_id:          string,      // FK overrides
  similar_prior_override_id: string | null,
  similarity_score:     number,      // 0..1
  outcome:              'correct' | 'overruled' | 'cycled' | 'dismissed',
  mape_with_override:   number,
  mape_without_override: number,     // counterfactual
  value_add_pts:        number,      // signed, can be negative
  finalized_at:         timestamp,
}
```

### championship_seasons

One row per season (monthly micro or quarterly Grand Prix).

```ts
{
  id:                  string,       // e.g. '2026-Q4-grand-prix'
  season_type:         'monthly' | 'quarterly',
  opens_at:            timestamp,
  closes_at:           timestamp,
  closed_at:           timestamp | null,
  podium:              JSONB,        // { league_id: [user_ids] }
  created_at:          timestamp,
}
```

### championship_scores

One row per (user, league, season).

```ts
{
  id:                  string,
  user_id:             string,
  league:              'override_value_add' | 'challenge_precision' | 'agent_improvement' | 'mentorship',
  season_id:           string,       // FK championship_seasons
  raw_score:           number,
  rank:                number,
  quartile:            1 | 2 | 3 | 4,
  contribution_count:  number,       // anti-gaming floor
  qualified:           boolean,      // contribution_count >= 5
  computed_at:         timestamp,
  hibt_replay_id:      string,       // for reproducibility
}
```

### lap_claps

One row per lap-clap given.

```ts
{
  id:                  string,
  giver:               string,       // user_id
  recipient:           string,       // user_id
  target_type:         'override' | 'challenge' | 'agent_improvement',
  target_id:           string,
  season_id:           string,
  note:                string,       // optional, max 200 chars
  created_at:          timestamp,
}
```

Cap enforcement at insert time: trigger raises error if giver has ≥ 5 claps this season OR recipient has ≥ 20 claps this season.

### visibility_preferences

One row per user. Lazy-created on first championship view.

```ts
{
  user_id:             string,       // PK
  championship_public: boolean,      // default false
  ghost_lap_default:   'on' | 'off', // default 'off'
  updated_at:          timestamp,
}
```

### Modified tables

**None.** All v3.0 work is additive. No backfill required for existing tables.

### Indexes & partitioning

- `second_opinion_runs` partitioned by `created_at` month; index on `forecast_set_id`
- `ghost_lap_projections` indexed on `(forecast_set_id, current_cycle_id)`; TTL-cleaned daily
- `championship_scores` indexed on `(season_id, league, quartile)` for fast leaderboard
- `recurring_challenges` indexed on `(status, last_raised_cycle)` for ghost-issue badge query
- `lap_claps` indexed on `(giver, season_id)` and `(recipient, season_id)` for cap enforcement

### Estimated storage

- `second_opinion_runs`: ≈ 4 MB/month at v3.0 scale (50 runs/day × avg 1.5 KB)
- `ghost_lap_projections`: ≈ 80 MB/cycle (200 forecast sets × 24 cycles × ~17 KB)
- `championship_*`: ≈ 2 MB/quarter (300 users × 4 leagues × ~1.5 KB)
- Total: well under 1 GB/year. Negligible relative to Planning Fabric (≈ 4 TB).

## Infrastructure investments

### New services

| Service | Layer | Stack | Owner | Notes |
| --- | --- | --- | --- | --- |
| `second-opinion-svc` | B (Process Engine) | Python · Litellm proxy · Redis queue | Mansoor A. | Dedicated service for blast-radius isolation. Pre-warmed worker pool to hit p95 ≤ 90s. |
| `ghost-lap-svc` | B | Python · DuckDB read replica · Redis cache | Mansoor A. | Reads precomputed projections; computes ad-hoc only for cache misses. |
| `champ-svc` | B | Python · Postgres read replica | Govinda C. | Read-heavy. Aggressive caching. Pure read-from-HIBT — no separate writes. |
| `precompute-nightly` | A (Planning Fabric) | Databricks job · Airflow DAG | Mansoor A. | Builds `ghost_lap_projections` for all active forecast sets. Idempotent. |
| `champ-scorer-nightly` | A | Databricks job | Govinda C. | Computes `championship_scores` end-of-day. Triggers `championship.season-closed` at season boundaries. |

### Service hardening (existing services)

| Component | Action | Owner |
| --- | --- | --- |
| HIBT v2.0 replay-prompt-ledger | Finalize GA (in flight). Critical path. | Mansoor A. |
| Decision-Rights API | Add scopes: `championship.public`, `championship.aggregate`, `second-opinion.invoke`, `ghost-lap.cross-sme` | Govinda C. |
| Feature flag service | Harden to 60s kill-switch SLA (CC-6). Add flags `pw.second-opinion` `pw.ghost-lap` `pw.championship`. | Govinda C. |
| Adversarial probe corpus | New library. 100 cases each for SO, 50 for GL, 30 for CT (PRD eval gates). | Don S. + Bob R. |
| Cost-budget enforcer | Extend to per-seat daily budget (CC-7). 80% alerts, 110% hard cap. | Mansoor A. |

### Capacity additions

| Resource | Current | v3.0 target | Notes |
| --- | --- | --- | --- |
| LLM inference QPS budget | 12/sec | 18/sec | Driven by second-opinion auto-trigger at Gate 3 commits |
| Postgres read replicas | 2 | 3 | Added for `champ-svc` read traffic at 500 concurrent users |
| Redis cache | 8 GB | 16 GB | Ghost-lap projection cache + championship leaderboard cache |
| Databricks job slots | 4 nightly | 6 nightly | precompute-nightly + champ-scorer-nightly |
| Airflow scheduler | unchanged | unchanged | Two new DAGs fit existing capacity |

### Cross-cutting infra build

| Item | Description | Estimated ew | Owner |
| --- | --- | --- | --- |
| HIBT v2.0 GA finalization | Already ≈ 70% done. Replay determinism testing + soak test remaining. | 3 ew | Mansoor A. |
| Decision-Rights API extensions | 4 new scopes + middleware | 2 ew | Govinda C. |
| Feature flag service hardening | 60s kill-switch SLA + UI controls | 1 ew | Govinda C. |
| Adversarial probe corpus | 180 cases total + curator UI | 1 ew | Bob R. (curator) + Don S. (review) |
| Cost-budget enforcer extensions | Per-seat daily budget | 1 ew | Mansoor A. |
| **Total cross-cutting** | | **8 ew** | |

### Observability

New dashboards required (Grafana). Pre-built panel templates in `nama-observability` repo.

- **Second-Opinion dashboard**: p50/p95/p99 latency, runs/min, MDS distribution, dismissal-rate by reason code, cost/run, error rate
- **Ghost-Lap dashboard**: cache hit rate, precompute job duration, recurring-challenge detection counts, classifier confidence distribution
- **Championship dashboard**: viewer count, opt-in rate, lap-claps given/received distributions, score distribution by league
- **Cross-feature dashboard**: feature-flag state per seat, cost budget utilization, error budget burn rate

## Feature 1 · Second-Opinion Agent engineering spec

**PRD reference:** Feature 1 · Second-Opinion Agent
**Feature flag:** `pw.second-opinion`
**Service:** `second-opinion-svc`
**Effort estimate:** ≈ 16 engineer-weeks

### Subsystem diagram

```
                Workbench (override draft)        Approval card (Leadership)
                       │                                       │
                       └───────┬──────────────────────────┘
                               │
                               v
                    POST /forecasts/:id/second-opinion
                               │
                               v
               ┌─────────────────────────────┐
               │    second-opinion-svc        │
               │  ┌──────────────────────┐ │
               │  │ 1. cost-budget check    │ │
               │  │ 2. fetch primary run    │ │
               │  │ 3. select divergent     │ │
               │  │    prompt pack          │ │
               │  │ 4. invoke LLM (async)   │ │
               │  │ 5. compute MDS          │ │
               │  │ 6. raise challenge?     │ │
               │  │ 7. route to SME         │ │
               │  │ 8. emit event           │ │
               │  │ 9. write HIBT           │ │
               │  └──────────────────────┘ │
               └────────────┬────────────────┘
                          │
         ┌───────────────┼────────────────┐
         v                v                  v
  prompt_pack_store   LLM gateway      reason_code_catalog
  (S3)                (Litellm)        (Postgres)
```

### Service responsibilities

| Component | Responsibility |
| --- | --- |
| `second-opinion-svc.handler` | HTTP entry; validates request; enforces decision-rights; returns 202 + run_id immediately |
| `second-opinion-svc.runner` | Async worker; orchestrates steps 1–9; writes to `second_opinion_runs` |
| `second-opinion-svc.mds-calculator` | Pure function: takes primary + second results → returns MDS (0–1) + divergent factors |
| `second-opinion-svc.router` | Maps top divergent factor → SME team → specific SME (from on-call rota) |
| `second-opinion-svc.budget-enforcer` | Pre-flight cost check against per-seat daily budget |

### Divergent prompt pack design

Stored in `s3://nama-prompts/second-opinion/divergent_v1/`. Versioned and immutable.

Each pack contains:

- `framing.txt` — system prompt with deliberately different framing (bear vs. bull, top-down vs. bottom-up, etc.)
- `source_weights.yaml` — different weights for Avista, internal, MIA, dealer-pulse sources
- `model_params.yaml` — temperature offset (+0.2), top_p offset, etc.
- `regression_set.jsonl` — 100 golden cases for eval gate (PRD eval-SO-1)

Pack selection is server-side by default. Manual override allowed for GovOps testing.

### Latency budget (p95 ≤ 90s)

| Step | Budget | Notes |
| --- | --- | --- |
| Auth + decision-rights | 50 ms | Cached |
| Budget check | 30 ms | Cached |
| Fetch primary run | 200 ms | From HIBT |
| Prompt pack load | 50 ms | Cached in Redis |
| LLM invocation | 75 sec | Streamed; dominant cost |
| MDS compute | 100 ms | Pure CPU |
| Routing | 200 ms | Lookup |
| Event emit + HIBT write | 1 sec | Async fire-and-forget |
| **Total budget** | **≈ 77 sec** | Headroom for jitter |

### Failure modes

- **LLM timeout** → mark run `failed`, surface graceful UI message, do NOT block primary path
- **Budget exceeded** → return 429 with hint to GovOps for budget increase
- **HIBT unavailable** → fail fast (replay determinism is non-negotiable)
- **No primary run available** → return 400 with explanation

### Surfaces touched

- **Workbench** — button on override-draft card; side-panel result
- **Approval card** — auto-attached badge + inline summary
- **Teams** — routing notification to SME (uses existing Teams adapter)
- **HIBT** — every run logged with full reproducibility hash

### Effort breakdown

| Role | Engineer-weeks | Scope |
| --- | --- | --- |
| Backend | 5 | Service skeleton, async orchestration, routing, budget enforcer, HIBT writes |
| ML engineering | 6 | Divergent prompt pack, MDS calibration, eval-gate harness, regression suite |
| Frontend | 2 | Workbench + approval-card integration, side panel, dismissal UI |
| Data engineering | 2 | Table migrations, indexes, HIBT integration, replay determinism tests |
| Eval/QA | 1 | Golden set curation, adversarial probes, perf tests |
| **Total** | **16 ew** | |

## Feature 2 · Ghost Lap engineering spec

**PRD reference:** Feature 2 · Ghost Lap
**Feature flag:** `pw.ghost-lap`
**Service:** `ghost-lap-svc` + `precompute-nightly`
**Effort estimate:** ≈ 11 engineer-weeks

### Subsystem diagram

```
                Workbench chart                Teams challenge inbox
                       │                                │
                       └───────┬───────────────────────┘
                               │
                               v
                  GET /forecasts/:id/ghost-lap
                               │
                               v
             ┌────────────────────────────┐
             │    ghost-lap-svc              │
             │  1. cache lookup (Redis)      │
             │  2. if MISS: read projection  │
             │     from Postgres + warm cache│
             │  3. apply decision-rights     │
             │     filter (cross-SME privacy)│
             │  4. fetch recurring_challenges│
             │  5. fetch override_outcomes   │
             │  6. assemble response         │
             └──────────────┬─────────────┘
                            │
                            v
                   ghost_lap_projections (precomputed)
                            ↑
                            │
             ┌────────────────────────────┐
             │    precompute-nightly         │
             │    (Databricks job, 02:00 ET) │
             │    For each forecast_set:     │
             │      For each cycle in 24:    │
             │        compute projection     │
             │        compute MAPE delta     │
             │        write to table         │
             │    Then: classify recurring   │
             │        challenges + emit       │
             │        ghost-issue.detected    │
             └────────────────────────────┘
```

### Precompute pipeline

**Schedule:** Nightly at 02:00 ET via Airflow DAG `precompute_ghost_lap`.

**Steps:**

1. Query all active `forecast_sets` (typically ≈ 200)
2. For each forecast set, for each of the last 24 cycles, compute:
   - Baseline / consensus / P10 / P90 series
   - Actual series where elapsed
   - MAPE vs. realized actuals at current horizon
3. Write to `ghost_lap_projections` (upsert by composite key)
4. Run recurring-challenge classifier on `challenges` table:
   - Group by `(sme, reason_code, nameplate)`
   - Count consecutive cycles raised
   - If ≥ N (default 3), upsert to `recurring_challenges` and emit `ghost-issue.detected`
5. Run override-outcome attribution:
   - For each override with elapsed horizon, compute counterfactual MAPE, classify outcome
   - Find similar prior overrides via `(nameplate, reason_code, sign_of_delta)` similarity
   - Write to `override_outcomes`
6. Invalidate Redis cache keys for affected forecast sets

**Idempotency:** Job is fully idempotent. Replays produce identical output (verified by replay determinism test).

**Runtime budget:** ≈ 45 min for 200 forecast sets × 24 cycles. Headroom: 4-hour SLA.

### Cache strategy

- **Redis hot cache:** ghost-lap projections, 4-hour TTL, refreshed by nightly job
- **Cache key:** `gl:{forecast_set_id}:{cycle_offset}`
- **Cache size:** ≈ 200 forecast sets × 24 cycles × 17 KB = 80 MB
- **Miss fallback:** Read from Postgres + warm cache; SLA degrades from 2s to 4s p95 (AC-GL-1)

### Recurring-challenge classifier

Simple rule-based. Not a model. Deterministic.

```python
def detect_recurring(challenges_df, threshold_n=3):
    grouped = challenges_df.groupby(['sme', 'reason_code', 'nameplate'])
    recurring = []
    for key, group in grouped:
        cycles = sorted(group['cycle_id'].unique())
        consecutive = max_consecutive_run(cycles)
        if consecutive >= threshold_n:
            recurring.append({
                'sme': key[0],
                'reason_code': key[1],
                'nameplate': key[2],
                'cycles_open': consecutive,
                'first_raised_cycle': cycles[-consecutive],
                'last_raised_cycle': cycles[-1],
            })
    return recurring
```

Threshold N is per-nameplate-configurable (FR-GL-4). Default 3, range 2–6.

### Override-outcome similarity scorer

Weighted match:

- nameplate exact match: required
- reason_code exact match: 0.5 weight
- sign of delta match: 0.3 weight
- magnitude bucket match (±25% bands): 0.2 weight

Similarity ≥ 0.7 considered "similar prior" (AC-GL-3 requires ≥ 0.85 agreement with human labels — PRD eval gate validates).

### Privacy filter

Applied at response-assembly time in `ghost-lap-svc`:

```python
def filter_for_seat(ghost_lap_response, viewer_seat, viewer_id):
    if viewer_seat == 'sme':
        # SMEs see own challenges only in recurring_issues
        ghost_lap_response.recurring_issues = [
            r for r in ghost_lap_response.recurring_issues
            if r.sme == viewer_id
        ]
    elif viewer_seat in ('govops', 'leadership'):
        pass  # full visibility
    return ghost_lap_response
```

Eval gate: 20 cross-SME probe cases must yield 0 leakage (PRD eval-GL-5).

### Effort breakdown

| Role | Engineer-weeks | Scope |
| --- | --- | --- |
| Backend | 3 | `ghost-lap-svc`, classifier, similarity scorer, query layer |
| Data engineering | 4 | `precompute-nightly` job, schema, 24-cycle storage, cache layer |
| Frontend | 2 | Chart overlay, opacity slider, exec brief embed, ghost-issue badge |
| ML engineering | 1 | Classifier calibration + similarity scorer eval |
| Eval/QA | 1 | Privacy probes, visual regression, perf tests |
| **Total** | **11 ew** | |

## Feature 3 · Championship Table engineering spec

**PRD reference:** Feature 3 · Championship Table
**Feature flag:** `pw.championship`
**Service:** `champ-svc` + `champ-scorer-nightly`
**Effort estimate:** ≈ 7 engineer-weeks

### Subsystem diagram

```
              /championship page                Workbench in-context badge
                     │                                       │
                     └───────┬─────────────────────────┘
                             │
                             v
              GET /championship/:season
                             │
                             v
           ┌────────────────────────────┐
           │    champ-svc                  │
           │  1. cache lookup              │
           │  2. read championship_scores  │
           │  3. apply visibility prefs    │
           │     (quartile band for         │
           │      opt-out users)            │
           │  4. assemble leagues          │
           │  5. add viewer history        │
           │  6. add lap-clap counts       │
           └──────────────┬─────────────┘
                            │
                            v
                  championship_scores (precomputed)
                            ↑
                            │
           ┌────────────────────────────┐
           │    champ-scorer-nightly       │
           │    (after S&OP Gate 3 commits)│
           │    For each user, league:     │
           │      compute raw score from   │
           │        HIBT replay-from-source│
           │      rank, quartile           │
           │      anti-gaming check        │
           │    Emit championship.season-  │
           │      closed on season boundary│
           └────────────────────────────┘
```

### Scoring formulas

All formulas are **read-only over HIBT**. Never maintain a separate ledger. Every score is reproducible by replay-from-source.

#### Override Value-Add

```python
def override_value_add(user_id, season):
    overrides = hibt.query_overrides(actor=user_id, season=season)
    score = 0
    for o in overrides:
        outcome = override_outcomes.get(o.id)
        if not outcome:
            continue  # horizon not elapsed yet
        recency_weight = 0.5 ** (days_since(o.created_at) / 90)  # half-life 90d
        impact = outcome.value_add_pts * outcome.dollar_impact
        score += impact * recency_weight
    return score, len(overrides)
```

#### Challenge Precision

```python
def challenge_precision(user_id, season):
    challenges = hibt.query_challenges(actor=user_id, season=season)
    if len(challenges) < 5:
        return None, len(challenges)  # below qualifying floor
    successful = sum(1 for c in challenges if c.became_material_por_change)
    precision = successful / len(challenges)
    return precision, len(challenges)
```

#### Agent Improvement

```python
def agent_improvement(user_id, season):
    promotions = hibt.query_agent_promotions(promoted_by=user_id, season=season)
    score = 0
    for p in promotions:
        eval_delta = p.new_eval_score - p.prior_eval_score
        adoption = p.adoption_rate_at_close  # 0..1
        impact = p.estimated_dollar_impact
        score += eval_delta * adoption * impact
    return score, len(promotions)
```

#### Mentorship

```python
def mentorship(user_id, season):
    nominations = lap_claps.query_mentor_nominations(
        mentor=user_id, season=season, cap=3
    )
    score = 0
    for n in nominations:
        mentee_outcome = override_outcomes.get(n.target_id) or challenges.get(n.target_id)
        if mentee_outcome and mentee_outcome.was_successful:
            score += 1  # 1 point per credited successful contribution, capped at 3
    return score, len(nominations)
```

### Anti-gaming guardrails

1. **Minimum-contribution floor:** `qualified = (contribution_count >= 5)`. Users below floor appear with `quartile = null` and `rank = null`.
2. **Outlier detection:** Top 1% in each league flagged for GovOps review before recognition; never auto-recognized.
3. **Replay reproducibility:** Every score must reproduce from `hibt_replay_id`; backfill detects manipulation.
4. **Comp-system isolation:** Integration audit gate verifies zero export to comp / HR systems (AC-CT-8).
5. **Lap-clap caps:** Database trigger enforces `≤ 5 given per user per season`, `≤ 20 received per user per season`.

### Visibility model

Three visibility states per user per league:

- **Opted-in public:** Name + rank + score shown
- **Opted-out (default):** Slot appears as `AGGREGATE` with score visible but no name; user's own view always shows their full position
- **Below qualifying floor:** Not visible to anyone; user sees "5 contributions needed to qualify" in own view

### Performance budget

- 500 concurrent users → p95 ≤ 2s
- Achieved via: Redis cache for leaderboard, materialized view for ranks, read replica
- Cache invalidation on `championship.season-closed` event

### In-context recognition badges

Workbench renders small (16x16) badge on user-attributable items (overrides, challenges) when actor is in top quartile of relevant league. Badge is hover-explained: "Top quartile · Override Value-Add · Q4 2026". Toggleable per-viewer (default on).

### Effort breakdown

| Role | Engineer-weeks | Scope |
| --- | --- | --- |
| Backend | 3 | `champ-svc`, scoring engine, season manager, anti-gaming, opt-out |
| Frontend | 2 | `/championship` page, in-context badges, lap-clap UI, improvement-over-time view |
| Data engineering | 1 | `champ-scorer-nightly`, HIBT replay-from-source integration, 2-year history storage |
| Eval/QA | 1 | Gaming-detection probes, privacy probes, 500-user stress test |
| **Total** | **7 ew** | |

Note: this is the **smallest** of the three features by effort — and it ships **first** per the rollout sequencing (week 5 GA). Lightest stakes, celebratory framing.

## Build effort estimates & staffing gap

### Total by feature

| Feature | Engineer-weeks | % of total |
| --- | --- | --- |
| Second-Opinion Agent | 16 | 38% |
| Ghost Lap | 11 | 26% |
| Championship Table | 7 | 17% |
| Cross-cutting infra | 8 | 19% |
| **Total** | **42 ew** | **100%** |

### Total by role

| Role | Engineer-weeks | % of total |
| --- | --- | --- |
| Backend | 14 | 33% |
| Data engineering | 9 | 21% |
| ML engineering | 8 | 19% |
| Frontend | 6 | 14% |
| Eval / QA | 4 | 10% |
| Other (curator, architect, GovOps) | 1 | 3% |
| **Total** | **42 ew** | **100%** |

### Capacity vs. demand (the staffing gap)

**Demand:** 42 engineer-weeks total work.

**Available capacity** (current team, weeks 1–7 of v3.0 build):

- 2 backend engineers × 7 weeks = 14 ew
- 1 data engineer × 7 weeks = 7 ew
- 1 frontend engineer × 7 weeks = 7 ew
- 0.5 ML engineer (Don S. shared) × 7 weeks = 3.5 ew
- 0.5 architect (Bob R. shared) × 7 weeks = 3.5 ew

**Total capacity: 35 ew** vs. **demand 42 ew**. **Shortfall: ≈ 7 ew**, concentrated in ML engineering (need 8 ew, have 3.5).

### Three ways to close the gap

#### Option A — Hire ML engineer (recommended)

- Add 1 dedicated ML engineer (full-time) for v3.0 build
- Closes ML gap with headroom (+7 ew net)
- Permanent capacity for v3.5 strategic-horizon ML work
- Cost: ≈ $180k (annualized) — within $2.4M v3.0 budget
- Timeline impact: assumes hire closes by week 1; otherwise slip 2 weeks

#### Option B — Extend Second-Opinion GA by 2 weeks

- Keep current team
- Second-Opinion GA slips from week 7 → week 9
- Ghost Lap (week 6) and Championship (week 5) ship on time
- Communicate slip honestly at week 4 sponsor check-in

#### Option C — Descope divergent prompt pack to a single variant

- Reduces Second-Opinion ML work from 6 ew → 3 ew
- Saves 3 ew; remaining 4 ew shortfall absorbed by Option B (1-week slip)
- Risk: weakens core value (one divergent voice instead of contextual variants)
- Recommend only if Option A blocked

### Recommendation

**Option A.** ML engineer hire is the right answer:

1. We have permanent ML work coming in v3.5 anyway
2. The Second-Opinion calibration is genuinely complex — deserves a dedicated brain
3. Within budget
4. No timeline slip

Ramzi to approve at PRD ratification.

### Sequencing recommendation

```
Week 1–2 │ cross-cutting infra + 3 features P1 in parallel
Week 3   │ first eval-gate review (all 3 P1 completions)
Week 4   │ Championship Table P2 canary (lowest-stakes first)
Week 5   │ Championship Table GA (P4) → first delighter shipped
Week 5–6 │ Ghost Lap P2 → P3 canary
Week 6   │ Ghost Lap GA (P4)
Week 6–7 │ Second-Opinion P2 → P3 canary
Week 7   │ Second-Opinion GA (P4)
Week 8–12│ P5 tune-and-calibrate across all 3
```

### Critical-path callouts

1. **HIBT v2.0 GA must complete by end of week 1.** If it slips, everything slips in lockstep.
2. **ML engineer hire must close by end of week 1.** Backup plan: Option B (2-week Second-Opinion slip).
3. **Adversarial probe corpus must be ready by end of week 2.** Used in all 3 eval-gate reviews at week 3.
4. **Sponsor demo at end of week 4** (post-CT P2) is the first external visibility moment. Make it count.

## Observability, monitoring, SLOs

### SLOs per feature

#### Second-Opinion Agent

| SLO | Target | Window | Burn alert |
| --- | --- | --- | --- |
| Run success rate | 99.5% | 30 days | 5% budget remaining |
| p95 latency | ≤ 90 sec | 7 days | p95 > 100s sustained 30 min |
| p95 cost per run | ≤ $0.30 | 7 days | p95 > $0.40 sustained 24 h |
| Replay determinism | ≥ 98% | 7 days | < 95% on any day |
| SME-confirmation rate (calibration) | ≥ 70% | 30 days | < 60% sustained 7 days |

#### Ghost Lap

| SLO | Target | Window | Burn alert |
| --- | --- | --- | --- |
| Chart toggle p95 latency (warm) | ≤ 2 sec | 7 days | p95 > 3s sustained 30 min |
| Cache hit rate | ≥ 90% | 7 days | < 80% sustained 1 hour |
| Nightly precompute completion | < 60 min | per day | > 90 min on any day |
| Recurring-challenge false-positive rate | ≤ 5% | 30 days | > 10% sustained 7 days |
| Privacy leakage | 0 events | continuous | any event triggers P1 |

#### Championship Table

| SLO | Target | Window | Burn alert |
| --- | --- | --- | --- |
| Page render p95 latency (500 concurrent) | ≤ 2 sec | 7 days | p95 > 3s sustained 30 min |
| Score reproducibility | 100% | continuous | any mismatch triggers P1 |
| Privacy leakage | 0 events | continuous | any event triggers P1 |
| Cap enforcement (lap-clap) | 100% | continuous | any violation triggers P2 |
| Negative-experience incident | 0 events | continuous | any event triggers kill-switch review |

### Dashboards (Grafana)

Four new dashboards. Templates in `nama-observability` repo, owner: Govinda C.

#### Dashboard 1 · second-opinion-svc

Panels:

- Runs/min (line, last 24h)
- p50/p95/p99 latency (line, last 7 days)
- MDS distribution histogram (last 7 days)
- Cost per run (heatmap by day)
- Dismissal rate by reason code (stacked bar)
- Routing distribution (pie: MIA, Pricing, Ops, etc.)
- Replay-determinism failures (line, 0 is the goal)
- Per-seat budget utilization (gauges)

#### Dashboard 2 · ghost-lap-svc

Panels:

- Chart toggles/min (line)
- Cache hit rate (gauge)
- Cold-path latency (line)
- Nightly precompute job duration (line)
- Recurring-challenge counts by reason code (stacked bar)
- Classifier confidence distribution (histogram)
- Cross-SME privacy probe results (counter, 0 is the goal)

#### Dashboard 3 · champ-svc

Panels:

- Page views/min (line)
- Opt-in rate by league (gauge)
- Lap-claps given / received distributions (histograms)
- Score distribution by league (violin)
- Anti-gaming flags raised (counter)
- Negative-experience reports (counter, 0 is the goal)

#### Dashboard 4 · v3.0 rollup

Panels:

- Feature-flag state per seat (matrix)
- Cost budget utilization across features (stacked area)
- Error budget burn by feature (line)
- Eval gate pass/fail status (status grid)
- Phase progression per feature (timeline)

### Alerting

Alerts route to:

- **P1 (privacy, replay determinism, kill-switch trigger):** PagerDuty → on-call eng + Govinda + Bob, Slack `#nama-pit-wall-incident`
- **P2 (SLO burn, eval-gate calibration drift):** Slack `#nama-pit-wall-ops` + email digest
- **P3 (informational, budget approaching cap):** Slack `#nama-pit-wall-ops` only

### Drift watches

GovOps owns four drift watches:

1. **Second-Opinion MDS calibration drift** — weekly check of predicted MDS vs. SME-confirmation rate; alert if R² drops below 0.6
2. **Ghost Lap recurring-challenge classifier drift** — monthly review of false-positive rate against golden set
3. **Championship score reproducibility drift** — nightly random-sample replay; alert on any mismatch
4. **Feature adoption drift** — monthly review of usage rate vs. PRD success metrics; if any feature drops below 50% of target for 2 consecutive months, escalate to sponsor for continue/deprecate decision

## HIBT · provenance · version log

Replay-Prompt-Ledger for this engineering spec stub.

### Version history

| Version | Timestamp · UTC | Author | Prompt summary | Outcome |
| --- | --- | --- | --- | --- |
| **v1.0** | 2026-05-12 | Bob Rapp + Claude (Opus 4.7) | Generate a companion engineering specification stub for the v3.0 delighters PRD — architecture diagram, API contract changes, data-model deltas, infra investments, build effort estimates by feature. Same provenance style. | This document. Stub depth for engineering scoping. |

### Build inputs

- **Companion PRD**: NAMA Pit Wall v3.0 — Delighters PRD Addendum (this thread's preceding doc)
- **Source artifact**: NAMA Pit Wall v2.4 application
- **Pitch deck**: NAMA Pit Wall — Sponsor Review Deck v2.4
- **Architecture baseline**: v2.0 NAMA Agentic Ensemble Engine doc set (4-layer stack)

### Recreation notes

If this engineering spec stub needs to be regenerated:

1. Start with the v3.0 Delighters PRD addendum — it defines the **what**
2. This doc only describes the **how** — every requirement here traces back to a PRD line item
3. Preserve the key engineering decisions:
   - Second-Opinion as dedicated service (not config variant)
   - Ghost Lap precomputed nightly (not real-time)
   - Championship reads HIBT only (no separate ledger)
   - All 3 features behind kill-switch feature flags
   - HIBT v2.0 as single critical-path dependency
4. Preserve the staffing-gap callout — honest engineering scoping requires it
5. Maintain stub depth — don't expand to full implementation guide; that's the per-feature design docs' job
6. Re-derive effort estimates from the same role breakdown if scope changes

### Human edits outside the AI loop

None in v1.0. Will be tracked in subsequent versions as engineering team feedback is incorporated.

### Open questions for engineering review

1. **Litellm vs. direct provider SDKs** for second-opinion-svc — abstraction is convenient but adds latency. Confirm with Mansoor.
2. **DuckDB read replica for ghost-lap-svc** — alternative is Postgres logical replication. Confirm with Govinda; DuckDB may be cheaper at this volume.
3. **Materialized view vs. cache for champ-svc leaderboard** — trade-off between freshness and read latency. Default plan is cache; revisit if cache invalidation gets noisy.
4. **Adversarial probe corpus authorship** — PRD assumes Bob + Don curate. Validate timeline (1 ew); may need to expand author pool.
5. **HIBT v2.0 GA confidence** — currently 70% complete. Need Mansoor's confidence interval on end-of-week-1 GA.

These open questions should be resolved at the per-feature design doc stage, not in this stub.

### Owners · curators · RACI anchors

| Role | Owner |
| --- | --- |
| Engineering spec owner | Bob Rapp (architect) |
| Backend lead | Mansoor Alghooneh |
| Data engineering lead | Mansoor Alghooneh |
| Platform / API lead | Govinda Chaluvadi |
| ML engineering lead | TBD (Option A hire) or Don S. (interim, Option B) |
| Frontend lead | TBD (assign from existing team) |
| GovOps / eval gate owner | Don S. |
| Business sponsor | Ramzi Abdelmoula |
