# Second-Opinion Agent — Design Doc v1.0

> Implementation-grade design document for the Second-Opinion Agent (Feature 1 of the v3.0 Delighters). Expands the stub-depth engineering spec into actionable detail: full sequence diagrams, complete prompt pack contents, MDS algorithm spec, SME routing logic, eval harness design, finalized API contract, finalized data model, deployment plan, and 4 runbook stubs. This is the artifact an eng team builds from.

## Second-Opinion Agent · Design Doc v1.0

**Version:** 1.0
**Date:** 2026-05-12
**Status:** Draft for engineering review
**Service name:** `second-opinion-svc`
**Feature flag:** `pw.second-opinion`
**Target GA:** Week 7 of v3.0 build

### Companion documents

| Doc | Purpose | Owner |
| --- | --- | --- |
| [v3.0 Delighters PRD Addendum](#) · Feature 1 | The **why** — user stories, FRs, ACs, eval gates, success metrics | Bob Rapp |
| [v3.0 Engineering Spec Stub](#) · Section 6 | The **how at stub depth** — service responsibilities, effort, sequencing | Bob Rapp |
| **This document** | The **implementation contract** — sequence diagrams, prompt packs, eval harness, runbooks | ML eng lead (TBD) + Bob R. |

### Owners

| Role | Owner | Responsibility |
| --- | --- | --- |
| Design doc owner | Bob Rapp | Architecture decisions, owner of merge |
| Implementation lead | ML eng lead (TBD; Option A hire) | Service build, prompt pack, MDS calibration |
| Backend partner | Mansoor Alghooneh | Service infra, deployment, observability |
| API + data partner | Govinda Chaluvadi | API contract, schema, replay determinism |
| Eval gate owner | Don S. (GovOps) | Eval harness, gate sign-off |
| Domain expert | Krisztina Gilezan | Golden-set curation, calibration review |
| SME routing validator | Jim Kyle | Routing table review, on-call rota |
| Sponsor | Ramzi Abdelmoula | Final GA approval |

### Reviewers (sign before any code merges to main)

- Mansoor A. (backend)
- Govinda C. (API + data)
- Don S. (eval)
- Krisztina G. (domain)
- Jim K. (SME routing)

### What this doc covers

1. Detailed architecture + sequence diagrams (sync, async, auto-trigger, failure paths)
2. Service implementation — module structure, key code stubs, dependency injection
3. Full prompt pack — `divergent_v1` system prompts, framing, source weights, model params
4. MDS calculator — algorithm, weights, calibration procedure
5. SME routing logic — factor catalog, routing table, on-call rota integration
6. Eval harness — golden set + adversarial probes + calibration + perf + replay
7. API contract — finalized endpoints, error codes, polling semantics
8. Data model — finalized DDL, indexes, partitioning, retention
9. Deployment plan — environments, feature flag tactics, rollback
10. Runbook stubs — 4 common ops scenarios
11. Open questions log
12. HIBT version log

### What this doc does NOT cover

- Cross-feature decisions (covered in Engineering Spec stub)
- Per-team capacity plans (HR + staffing matter)
- Cost projections at run-rate (separate finance doc)
- Detailed UI mocks for Workbench + approval card integration (separate design spec)
- Disaster recovery + multi-region failover (covered in NAMA infra runbook — follow standard pattern)

## Architecture & sequence diagrams

### Service placement in the v2.4 stack

```
  Workbench  Outlook  Teams  Excel  SharePoint  PBI  Glean  HIBT
     │         │       │                                          (Layer D)
     └─────────┴───────┬─────────────────────────────────────────────
                       │
                       v
            Access API + Events                                       (Layer C)
                       │
         ┌─────────────┴────────────────┐
         v                            v
    POST /so                  Event: gate3.commit.pending
         │                            │
         v                            v
    ┌─────────────────────────────────────┐                          (Layer B)
    │           second-opinion-svc            │
    │  ─ handler  (HTTP entry)                │
    │  ─ runner   (async orchestrator)        │
    │  ─ budget   (per-seat budget enforcer)  │
    │  ─ prompt-pack (loader + cache)         │
    │  ─ llm-client (Litellm wrapper)         │
    │  ─ mds      (disagreement calculator)   │
    │  ─ router   (SME routing logic)         │
    │  ─ hibt     (ledger writer)             │
    └─────────────────────────────────────┘
         │           │         │         │
         v           v         v         v
    LLM gateway   prompt    HIBT       Postgres
    (Litellm)     store     ledger     (so tables)
                  (S3)
```

### Sequence 1 · manual invocation (Analyst clicks button)

```
Analyst   Workbench UI   API gateway   so-svc.handler   so-svc.runner   LLM       HIBT
   │             │             │              │               │           │         │
   │ click       │             │              │               │           │         │
   │────────────>│             │              │               │           │         │
   │             │ POST /so    │              │               │           │         │
   │             │────────────>│              │               │           │         │
   │             │             │  forward     │               │           │         │
   │             │             │────────────>│               │           │         │
   │             │             │              │  auth+rights  │           │         │
   │             │             │              │  budget check │           │         │
   │             │             │              │  spawn runner │           │         │
   │             │             │              │──────────────>│           │         │
   │             │ 202 + run_id│              │               │           │         │
   │             │<────────────│              │               │           │         │
   │ spinner     │             │              │  fetch primary│           │         │
   │<────────────│             │              │               │─────────>│         │
   │             │             │              │               │ primary    │         │
   │             │             │              │               │<─────────│         │
   │             │             │              │               │ load pack │         │
   │             │             │              │               │ LLM call  │         │
   │             │             │              │               │─────────>│         │
   │             │ poll status │              │               │           │         │
   │             │────────────>│              │               │           │         │
   │             │ running     │              │               │           │         │
   │             │<────────────│              │               │           │         │
   │             │             │              │               │ result    │         │
   │             │             │              │               │<─────────│         │
   │             │             │              │               │ compute MDS         │
   │             │             │              │               │ route SME │         │
   │             │             │              │               │ write ledger        │
   │             │             │              │               │──────────────────>│
   │             │             │              │               │ done       │         │
   │             │             │              │<──────────────│           │         │
   │             │ poll status │              │               │           │         │
   │             │────────────>│              │               │           │         │
   │             │ complete + result          │               │           │         │
   │             │<────────────│              │               │           │         │
   │ render side panel       │              │               │           │         │
   │<────────────│             │              │               │           │         │
```

**Latency budget:** ≤ 90 sec p95 end-to-end. LLM call dominates (≈75 sec).

**Polling cadence:** Workbench polls every 2 sec while status=running. Max 60 polls before timeout fallback.

### Sequence 2 · auto-trigger (Gate 3 commit)

```
Process Engine                    so-svc.runner             LLM     HIBT
      │                                 │                    │        │
      │ emit gate3.commit.pending       │                    │        │
      │ (FS-2026Q3-NA-TRK-001 ≥ $50M)   │                    │        │
      │───────────────────────────────────>│                    │        │
      │                                 │ budget check       │        │
      │                                 │ fetch primary      │        │
      │                                 │ LLM call           │        │
      │                                 │───────────────────>│        │
      │                                 │ result             │        │
      │                                 │<───────────────────│        │
      │                                 │ compute MDS        │        │
      │                                 │ if MDS ≥ 0.3:      │        │
      │                                 │   raise challenge  │        │
      │                                 │   route to SME     │        │
      │                                 │   block POR commit │        │
      │ emit second-opinion.raised      │                    │        │
      │<───────────────────────────────────│                    │        │
      │ (process engine pauses commit, awaits SME response)              │
      │                                 │ write ledger       │        │
      │                                 │───────────────────────────>│
```

**Critical behavior:** Auto-trigger that raises a challenge with MDS ≥ 0.3 **blocks** the Gate 3 commit until the SME responds or owner explicitly dismisses with reason code. This is a hard gate (per PRD FR-SO-7).

### Sequence 3 · failure path — LLM timeout

```
runner          LLM       HIBT
   │             │         │
   │ LLM call    │         │
   │───────────>│         │
   │             │         │
   │ (90 sec passes; no response)
   │             │         │
   │ cancel + log failure   │
   │ status → 'failed'      │
   │────────────────────>│
   │                       │
   v
 surface to UI: "Second opinion unavailable. You can proceed with primary analysis."
 primary path NOT blocked. User can submit override or commit without second opinion.
```

**Critical guarantee:** Service failure NEVER blocks the primary forecasting path. Degraded gracefully.

### Sequence 4 · failure path — budget breach

```
handler                budget enforcer        runner
   │                          │                  │
   │ incoming request         │                  │
   │───────────────────────>│                  │
   │                          │ check seat budget│
   │                          │ today: $4.00 cap │
   │                          │ used:  $3.92     │
   │                          │ est:   +$0.20    │
   │                          │ → would exceed   │
   │ 429 + reason            │                  │
   │<───────────────────────│                  │
   │ alert GovOps             │                  │
```

User sees: "Your daily second-opinion budget is used up. Reset at midnight ET, or contact GovOps for budget increase."

## Service implementation

### Module structure

```
second-opinion-svc/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI entry
│   ├── handler.py           # HTTP route handlers
│   ├── runner.py            # Async orchestrator
│   ├── budget.py            # Per-seat budget enforcement
│   ├── prompt_pack.py       # Pack loader + Redis cache
│   ├── llm_client.py        # Litellm wrapper, retry, streaming
│   ├── mds.py               # Material disagreement score
│   ├── router.py            # SME routing
│   ├── hibt.py              # HIBT ledger writes
│   ├── models.py            # Pydantic schemas
│   ├── db.py                # asyncpg pool
│   └── settings.py          # env-driven config
├── prompts/
│   ├── divergent_v1/
│   │   ├── system.txt
│   │   ├── framing.txt
│   │   ├── source_weights.yaml
│   │   ├── model_params.yaml
│   │   └── regression.jsonl
│   └── (future variants)
├── tests/
│   ├── unit/
│   ├── integration/
│   ├── golden_set/
│   ├── adversarial/
│   ├── calibration/
│   └── perf/
├── runbooks/
│   ├── budget_breach.md
│   ├── latency_spike.md
│   ├── replay_drift.md
│   └── calibration_drift.md
├── Dockerfile
├── docker-compose.yml      # local dev
├── pyproject.toml
├── .github/workflows/eval-gates.yml
└── README.md
```

### Key code stubs

#### app/runner.py

```python
import asyncio
from dataclasses import dataclass
from .budget import BudgetEnforcer
from .prompt_pack import PromptPackLoader
from .llm_client import LLMClient
from .mds import MDSCalculator
from .router import SMERouter
from .hibt import HIBTWriter

@dataclass
class RunContext:
    run_id: str
    forecast_set_id: str
    trigger: str               # 'manual' | 'auto_gate3'
    triggered_by: str
    prompt_pack: str
    primary_result: dict       # full primary run from HIBT
    timeout_ms: int = 90_000

class Runner:
    def __init__(self, deps):
        self.budget = deps.budget
        self.packs = deps.packs
        self.llm = deps.llm
        self.mds = deps.mds
        self.router = deps.router
        self.hibt = deps.hibt
        self.db = deps.db

    async def run(self, ctx: RunContext):
        await self.db.update_status(ctx.run_id, 'running')
        try:
            pack = await self.packs.load(ctx.prompt_pack)
            est_cost = self.llm.estimate_cost(pack, ctx.primary_result)
            await self.budget.consume(ctx.triggered_by, est_cost)
            
            llm_result = await asyncio.wait_for(
                self.llm.invoke(pack, ctx.primary_result),
                timeout=ctx.timeout_ms / 1000
            )
            
            mds_score, divergent_factors = self.mds.compute(
                primary=ctx.primary_result,
                secondary=llm_result
            )
            
            challenge_id = None
            route = None
            if mds_score >= 0.30:
                route = self.router.route(divergent_factors)
                challenge_id = await self.create_challenge(ctx, route, llm_result)
            
            await self.hibt.write_run(ctx, llm_result, mds_score, divergent_factors, challenge_id)
            await self.db.update_complete(ctx.run_id, mds_score, divergent_factors, challenge_id)
            return {'status':'completed', 'mds':mds_score, 'challenge_id':challenge_id, 'route':route}
        
        except asyncio.TimeoutError:
            await self.hibt.write_failure(ctx, reason='llm_timeout')
            await self.db.update_status(ctx.run_id, 'failed', reason='timeout')
            return {'status':'failed','reason':'timeout'}
        
        except BudgetExceeded as e:
            await self.db.update_status(ctx.run_id, 'failed', reason='budget')
            raise
```

#### app/mds.py

```python
from dataclasses import dataclass
from typing import List

@dataclass
class DivergentFactor:
    factor: str
    category: str       # pricing | mia | ops | tariff | competitive
    weight: float       # 0..1 contribution to MDS
    evidence_links: List[str]

class MDSCalculator:
    """
    MDS = w1 * point_delta + w2 * (1 - band_overlap) + w3 * (1 - source_overlap) + w4 * factor_count_norm

    Default weights (locked at v1.0, recalibrated quarterly):
      w1 = 0.35  point-estimate delta normalized by primary P10-P90 width
      w2 = 0.30  confidence-band non-overlap (Jaccard)
      w3 = 0.20  source-evidence non-overlap (Jaccard)
      w4 = 0.15  divergent-factor count normalized (factors with weight > 0.1, capped at 5)
    """
    W1, W2, W3, W4 = 0.35, 0.30, 0.20, 0.15

    def compute(self, primary, secondary):
        point_delta_norm = self._point_delta(primary, secondary)
        band_overlap = self._band_overlap(primary, secondary)
        source_overlap = self._source_overlap(primary, secondary)
        factors = self._extract_factors(primary, secondary)
        factor_count_norm = min(len([f for f in factors if f.weight > 0.1]), 5) / 5.0
        
        mds = (self.W1 * point_delta_norm 
             + self.W2 * (1 - band_overlap)
             + self.W3 * (1 - source_overlap)
             + self.W4 * factor_count_norm)
        return min(1.0, max(0.0, mds)), factors

    def _point_delta(self, p, s):
        width = max(1.0, p['p90'] - p['p10'])  # guard against zero-width
        return min(1.0, abs(p['value'] - s['value']) / width)

    def _band_overlap(self, p, s):
        lo = max(p['p10'], s['p10']); hi = min(p['p90'], s['p90'])
        if hi <= lo: return 0.0
        union = max(p['p90'], s['p90']) - min(p['p10'], s['p10'])
        return (hi - lo) / union

    def _source_overlap(self, p, s):
        ps = set(p['sources']); ss = set(s['sources'])
        if not ps and not ss: return 1.0
        return len(ps & ss) / max(1, len(ps | ss))

    def _extract_factors(self, p, s):
        # ... extract from LLM-emitted structured factor list, intersect with NAMA factor catalog
        # returns list of DivergentFactor
        ...
```

#### app/router.py

```python
ROUTING_TABLE = {
    # factor                  : (category,           default_team)
    'incentive_elasticity'    : ('pricing',          'pricing-oncall'),
    'texas_dealer_pulse'      : ('mia',              'jim-kyle-team'),
    'sierra_hd_cross_shop'    : ('mia',              'jim-kyle-team'),
    'silverado_ev_competitive': ('mia',              'competitive-intel'),
    'tariff_mexico'           : ('external_affairs', 'trade-policy'),
    'tariff_china'            : ('external_affairs', 'trade-policy'),
    'inventory_constraint'    : ('ops',              'supply-chain-oncall'),
    'plant_capacity'          : ('ops',              'plant-planning-oncall'),
    'dealer_inventory_pull'   : ('mia',              'jim-kyle-team'),
    'competitive_launch_ev'   : ('mia',              'competitive-intel'),
    'macro_consumer'          : ('mia',              'macro-team'),
    'incentive_competitor'    : ('pricing',          'pricing-oncall'),
    'fleet_demand'            : ('fleet',            'fleet-planning'),
    # ... ~30 factors total in v1.0; expand via prompt-pack metadata
}

class SMERouter:
    def __init__(self, oncall_client):
        self.oncall = oncall_client  # NAMA on-call rota API

    def route(self, divergent_factors):
        if not divergent_factors:
            return {'team': 'mia', 'sme': 'default-mia-sme', 'fallback': True}
        top = max(divergent_factors, key=lambda f: f.weight)
        team, default_oncall = ROUTING_TABLE.get(
            top.factor, ('mia', 'jim-kyle-team')
        )
        sme = self.oncall.lookup(team) or default_oncall
        return {
            'team': team,
            'sme': sme,
            'top_factor': top.factor,
            'top_factor_weight': top.weight,
            'fallback': False if top.factor in ROUTING_TABLE else True
        }
```

#### app/budget.py

```python
class BudgetEnforcer:
    DAILY_CAP_USD = 4.00
    ALERT_THRESHOLD = 0.80  # 80% triggers Slack notify
    HARD_CAP_THRESHOLD = 1.10  # 110% triggers hard block

    def __init__(self, redis, alerter):
        self.r = redis
        self.alerter = alerter

    async def consume(self, seat: str, est_cost_usd: float):
        key = f'so_budget:{seat}:{today_utc_date()}'
        used = float(await self.r.get(key) or 0)
        new_total = used + est_cost_usd
        if new_total > self.DAILY_CAP_USD * self.HARD_CAP_THRESHOLD:
            raise BudgetExceeded(seat=seat, used=used, cap=self.DAILY_CAP_USD)
        await self.r.incrbyfloat(key, est_cost_usd)
        await self.r.expire(key, 90_000)  # 25h, auto-rolls at midnight
        if new_total > self.DAILY_CAP_USD * self.ALERT_THRESHOLD:
            await self.alerter.notify_budget_warn(seat, new_total, self.DAILY_CAP_USD)
```

### Dependency injection

All services injected via FastAPI's `Depends`. Single composition root in `main.py`:

```python
def build_app():
    redis = redis_pool(settings.REDIS_URL)
    db = pg_pool(settings.PG_URL)
    s3 = s3_client(settings.PROMPT_BUCKET)
    
    deps = Deps(
        budget = BudgetEnforcer(redis, Alerter()),
        packs = PromptPackLoader(s3, redis),
        llm = LLMClient(model=settings.SO_MODEL),
        mds = MDSCalculator(),
        router = SMERouter(OnCallClient()),
        hibt = HIBTWriter(settings.HIBT_URL),
        db = DBClient(db),
    )
    return FastAPI_app_with(deps)
```

## Prompt pack · `divergent_v1`

Location: `s3://nama-prompts/second-opinion/divergent_v1/`. Versioned, immutable. Every run records `prompt_pack` in HIBT for replay determinism.

### Files in the pack

```
divergent_v1/
├── system.txt              # Base system prompt
├── framing.txt             # Divergent framing instructions
├── source_weights.yaml     # Different source weights vs. primary
├── model_params.yaml       # Model + temperature + top_p
├── output_schema.json      # Structured output schema
├── regression.jsonl        # 100 golden cases for eval
└── README.md               # Pack provenance + change log
```

### `system.txt` (excerpt)

```
You are the NAMA Second-Opinion Agent. Your role is NOT to produce the best forecast.
Your role is to produce a deliberately DIFFERENT forecast that the primary agent
would not produce, so that human reviewers can see what disagreement exists.

You will:
1. Read the primary forecast and its supporting evidence
2. Generate an INDEPENDENT analysis using a different framing (see framing.txt)
3. Weight sources differently than the primary (see source_weights.yaml)
4. Output a structured JSON response with your value, P10/P90, sources cited,
   and a list of DIVERGENT FACTORS that explain why you reached a different
   conclusion.

You are NOT trying to be "more right" than the primary. You are trying to be
USEFULLY DIFFERENT — to surface assumptions, weighting choices, or evidence
selection that a single agent might miss.

If, after honest analysis, you genuinely agree with the primary within tight
tolerance (point estimate within 1% AND P10-P90 band 80%+ overlap), output
status="agree" and explain why agreement is robust. Agreement is acceptable
and sometimes correct.

Never fabricate sources. Never overstate confidence. Never adopt the primary's
framing as a starting point.
```

### `framing.txt` (excerpt)

```
DIVERGENT FRAMING INSTRUCTIONS:

The primary agent typically uses a "top-down macro → bottom-up nameplate" framing.
Your framing must be DIFFERENT. Choose ONE of these (rotate weekly via pack version):

[A] BOTTOM-UP DEALER-PULSE FRAMING
Start with the freshest dealer-pulse signal. Build up from regional
shifts, cross-shop indices, and weekly retail. Treat the macro envelope
as a constraint, not the starting point.

[B] CONSTRAINT-FIRST FRAMING
Start with the production and supply constraints. Build the forecast as
"what can we actually deliver?" and let demand cap to that ceiling.
Macro and incentive are second-order.

[C] BEAR-CASE FRAMING
Start with the bear case. What are the 2-3 risks that could materially
push volume DOWN from where the primary landed? Weight those risks at
their 75th-percentile severity, not their expected value.

For v1.0 launch: use FRAMING [C] BEAR-CASE.
For pack updates: GovOps owns framing rotation cadence.
```

### `source_weights.yaml`

```yaml
# Source weights for divergent_v1
# Compare to primary weights (in nama-prompts/primary/source_weights.yaml)

sources:
  avista_cross_shop:
    weight: 1.50          # primary uses 1.0  — boost real-time signal
    recency_decay_days: 7  # primary uses 21
  internal_billings:
    weight: 0.70          # primary uses 1.0  — dampen internal bias
    recency_decay_days: 14
  mia_dealer_pulse:
    weight: 1.30          # primary uses 1.0
    recency_decay_days: 14
  macro_oecd:
    weight: 0.50          # primary uses 1.0  — deprioritize for tactical horizons
  competitor_launch_calendar:
    weight: 1.20          # primary uses 1.0
  pricing_committee_signals:
    weight: 1.00
  external_press_tariff:
    weight: 1.10          # primary uses 0.6  — take tariff signal more seriously

fallback_weight: 0.5      # any source not listed above
```

### `model_params.yaml`

```yaml
# Model parameters for divergent_v1
# Differences from primary are tagged with `delta:` comments

model: anthropic/claude-opus-4.7        # delta: primary uses gpt-4o
temperature: 0.4                        # delta: primary uses 0.2
top_p: 0.95                             # delta: primary uses 0.9
max_tokens: 4000

timeout_ms: 75000                       # leaves ~15s headroom under 90s SLA
retries:
  attempts: 2
  backoff_initial_ms: 500
  backoff_max_ms: 4000

streaming: true                         # required for sub-90s latency on long generations
```

Rationale: different model provider AND different framing AND different source weights
produces meaningful divergence without being a coin flip. Each lever alone would be
insufficient; the combination is the design.

### `output_schema.json` (abbreviated)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["status", "value", "p10", "p90", "sources", "divergent_factors", "rationale"],
  "properties": {
    "status": { "enum": ["disagree", "agree"] },
    "value": { "type": "number" },
    "p10": { "type": "number" },
    "p90": { "type": "number" },
    "sources": {
      "type": "array",
      "items": { "type": "object", "required": ["id", "weight_used"] }
    },
    "divergent_factors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["factor", "category", "weight", "evidence_links"],
        "properties": {
          "factor": { "type": "string" },
          "category": { "enum": ["pricing", "mia", "ops", "tariff", "competitive", "fleet", "macro"] },
          "weight": { "type": "number", "minimum": 0, "maximum": 1 },
          "evidence_links": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "rationale": { "type": "string", "maxLength": 1500 }
  }
}
```

### `regression.jsonl` (sample 3 of 100 cases)

```jsonl
{"case_id":"reg-001","forecast_set_id":"FS-2025Q3-NA-TRK-001","primary_value":318200,"primary_p10":292000,"primary_p90":345000,"expected_status":"disagree","expected_mds_range":[0.35,0.55],"expected_top_factor_category":"mia","sme_judge":"krisztina_g","notes":"Texas dealer pulse signal was visible; primary missed it. Divergent agent should catch."}
{"case_id":"reg-002","forecast_set_id":"FS-2025Q4-NA-SUV-001","primary_value":104500,"primary_p10":97000,"primary_p90":113000,"expected_status":"agree","expected_mds_range":[0.05,0.18],"expected_top_factor_category":null,"sme_judge":"krisztina_g","notes":"Clean cycle, no material disagreement expected. Divergent agent should converge."}
{"case_id":"reg-003","forecast_set_id":"FS-2025Q2-NA-EV-001","primary_value":62000,"primary_p10":55000,"primary_p90":71000,"expected_status":"disagree","expected_mds_range":[0.40,0.65],"expected_top_factor_category":"competitive","sme_judge":"jim_kyle","notes":"Competitor launch signal weighted too low by primary."}
```

Golden set composition: 60% disagreement cases (with expected MDS bands), 40% agreement cases. Curated by Krisztina G. + Jim K. against Q1–Q3 2025 retrospective data with known outcomes.

### Pack versioning

- `divergent_v1` — v1.0 launch pack, FRAMING [C] bear-case
- `divergent_v2+` — reserved for GovOps-owned framing rotation (quarterly)
- All packs preserved indefinitely; HIBT records pack version with every run for replay determinism
- Pack changes go through eval gate before promotion (per PRD CC-3)

## MDS calculator · algorithm + calibration

### Formula

```
MDS = W1·point_delta_norm + W2·(1 - band_overlap) + W3·(1 - source_overlap) + W4·factor_count_norm

where:
  W1 = 0.35    point-estimate delta, normalized by primary P10-P90 width
  W2 = 0.30    confidence-band non-overlap (Jaccard distance)
  W3 = 0.20    source-evidence non-overlap (Jaccard distance)
  W4 = 0.15    divergent-factor count, normalized (factors with weight > 0.1, capped at 5)

  Sum of weights = 1.0
  MDS clamped to [0, 1]
```

### Component definitions

**point_delta_norm:**

```
point_delta_norm = min(1.0, |primary.value - secondary.value| / max(1, primary.p90 - primary.p10))
```

Rationale: A 1-unit delta on a forecast with P10-P90 width of 100 is small (point_delta_norm = 0.01). A 50-unit delta on the same forecast is large (0.50). Normalization by primary's own uncertainty makes the metric forecast-size-invariant.

**band_overlap (Jaccard intersection over union):**

```
lo = max(primary.p10, secondary.p10)
hi = min(primary.p90, secondary.p90)
intersection = max(0, hi - lo)
union = max(primary.p90, secondary.p90) - min(primary.p10, secondary.p10)
band_overlap = intersection / union   # 0 to 1, where 1 = identical intervals
```

Rationale: Two forecasts that point-estimate the same value but with very different confidence intervals are still meaningfully different. Band overlap captures that.

**source_overlap (Jaccard on source documents):**

```
source_overlap = |primary.sources ∩ secondary.sources| / |primary.sources ∪ secondary.sources|
```

Rationale: If the second agent reached its conclusion using completely different sources, it has surfaced a different evidence base — likely meaningful disagreement.

**factor_count_norm:**

```
significant_factors = [f for f in secondary.divergent_factors if f.weight > 0.1]
factor_count_norm = min(len(significant_factors), 5) / 5.0
```

Rationale: A second opinion that names 5+ distinct divergent factors is structurally more disagreement-rich than one naming a single factor.

### Threshold

- **MDS ≥ 0.30** → raise structured challenge
- **MDS in [0.10, 0.30)** → log second-opinion run as "qualified agreement" with no challenge
- **MDS < 0.10** → log as "strong agreement"

Threshold of 0.30 is calibrated to PRD acceptance criterion AC-SO-3: SME-confirmation rate ≥ 70% on raised challenges.

### Calibration procedure

Run quarterly. Owner: ML eng lead + Don S. + Krisztina G.

1. Sample 50 production runs with raised challenges over the prior quarter
2. SME (Jim K.'s team for MIA-routed, Pricing on-call for pricing-routed, etc.) labels each:
   - **TP** — confirmed material disagreement
   - **FP** — noise / spurious / already considered
3. Compute SME-confirmation rate by MDS decile
4. Plot calibration curve
5. If R² between predicted MDS and realized confirmation rate < 0.7, recalibrate weights via grid search on the golden set
6. New weights deployed via pack version bump (e.g., `divergent_v1.1` with same prompt content but updated MDS weights) — still gated by full eval suite

### Calibration target (from PRD)

| Eval gate | Threshold |
| --- | --- |
| Precision on golden set | ≥ 85% |
| Recall on golden set | ≥ 80% |
| Calibration R² | ≥ 0.7 |
| Adversarial probe accuracy | ≥ 90% |
| Replay determinism | ≥ 98% |

### Worked example

Forecast set FS-2026Q3-NA-TRK-001 (Q3 Trucks consensus):

```
Primary:
  value: 312,400
  p10:   287,600
  p90:   338,900
  sources: {avista_2026w19, internal_billings_w19, mia_dealer_pulse_w19, macro_oecd_q2}

Second opinion (divergent_v1, bear-case framing):
  value: 304,200
  p10:   281,400
  p90:   328,500
  sources: {avista_2026w19, mia_dealer_pulse_w19, competitor_launch_calendar_q3, dealer_inventory_pull_w19}
  divergent_factors: [
    {factor: texas_dealer_pulse, category: mia, weight: 0.34},
    {factor: sierra_hd_cross_shop, category: mia, weight: 0.28},
    {factor: competitive_launch_ev, category: mia, weight: 0.19}
  ]

point_delta_norm = |312400 - 304200| / (338900 - 287600) = 8200 / 51300 = 0.160
band_overlap     = (328500 - 287600) / (338900 - 281400) = 40900 / 57500 = 0.711
source_overlap   = 2 / 6 = 0.333
factor_count_norm = min(3, 5) / 5 = 0.600

MDS = 0.35 · 0.160 + 0.30 · (1 - 0.711) + 0.20 · (1 - 0.333) + 0.15 · 0.600
    = 0.056 + 0.0867 + 0.133 + 0.090
    = 0.366

MDS = 0.37 → ABOVE 0.30 threshold → raise challenge
Top factor: texas_dealer_pulse (mia category)
Route to: MIA team → Jim Kyle
```

This worked example is used as case `reg-001` in the regression suite.

## SME routing logic

### Routing table (v1.0)

Full table lives in `app/routing_table.py` and is also exported to `prompts/divergent_v1/factor_catalog.yaml` for prompt-pack reference.

| Factor | Category | Default team | Primary on-call SME |
| --- | --- | --- | --- |
| incentive_elasticity | pricing | pricing-oncall | Pricing committee chair |
| competitor_incentive_match | pricing | pricing-oncall | Pricing committee chair |
| texas_dealer_pulse | mia | jim-kyle-team | Jim Kyle |
| california_dealer_pulse | mia | jim-kyle-team | Jim Kyle |
| sierra_hd_cross_shop | mia | jim-kyle-team | Jim Kyle |
| silverado_ev_competitive | mia | competitive-intel | MIA competitive lead |
| competitive_launch_ev | mia | competitive-intel | MIA competitive lead |
| competitive_launch_ice | mia | competitive-intel | MIA competitive lead |
| dealer_inventory_pull | mia | jim-kyle-team | Jim Kyle |
| fleet_demand | fleet | fleet-planning | Fleet planning lead |
| tariff_mexico | external_affairs | trade-policy | Trade policy lead |
| tariff_china | external_affairs | trade-policy | Trade policy lead |
| regulatory_emission | external_affairs | regulatory-affairs | Regulatory affairs lead |
| plant_capacity | ops | plant-planning-oncall | Plant planning on-call |
| inventory_constraint | ops | supply-chain-oncall | Supply chain on-call |
| supplier_risk | ops | supplier-risk-oncall | Supplier risk on-call |
| logistics_disruption | ops | logistics-oncall | Logistics on-call |
| macro_consumer | macro | macro-team | Macro analyst on-call |
| macro_interest_rate | macro | macro-team | Macro analyst on-call |
| macro_fuel_price | macro | macro-team | Macro analyst on-call |
| ev_charging_adoption | mia | ev-intelligence | EV intelligence lead |
| trade_in_dynamics | mia | jim-kyle-team | Jim Kyle |
| residual_value_signal | mia | jim-kyle-team | Jim Kyle |
| seasonal_anomaly | data-science | ds-oncall | Forecasting on-call |
| model_drift_internal | data-science | ds-oncall | Forecasting on-call |

Default fallback: `('mia', 'jim-kyle-team')`. Factor catalog audit by Jim K. at v1.0 launch and quarterly thereafter.

### On-call rota integration

Routing calls `OnCallClient.lookup(team)` which queries the NAMA on-call rota service (existing). Returns the current on-call SME's user_id.

Fallback chain:

1. On-call rota lookup (live)
2. Team default SME (from routing table)
3. Team-wide alias (`team-xxx@gm.com`)
4. Global default (Jim K. for MIA, designated escalation for others)

### Routing payload

What gets handed to the SME:

```json
{
  "forecast_set_id": "FS-2026Q3-NA-TRK-001",
  "run_id": "so_run_abc123",
  "mds": 0.37,
  "primary": { "value": 312400, "p10": 287600, "p90": 338900 },
  "second_opinion": { "value": 304200, "p10": 281400, "p90": 328500 },
  "delta": -8200,
  "top_factor": {
    "factor": "texas_dealer_pulse",
    "category": "mia",
    "weight": 0.34,
    "evidence_links": ["/MIA/dealer-pulse-week19.pptx", "/MIA/avista-tx-may.xlsx"]
  },
  "all_divergent_factors": [ /* full list */ ],
  "requested_response": {
    "action": "confirm_or_pushback",
    "sla_minutes": 90,
    "context": "Q3 Trucks Gate 3 commit awaits your input before plan-of-record can proceed."
  },
  "deep_links": {
    "workbench": "https://pitwall.nama/forecasts/FS-2026Q3-NA-TRK-001",
    "hibt_replay": "https://hibt.nama/runs/so_run_abc123"
  }
}
```

Delivered to SME via:

- Teams adaptive card (primary delivery)
- Email digest (fallback if Teams unreachable for 5 min)
- SMS only for SLA-critical Gate 3 blocks (PRD-approved escalation)

### Routing edge cases

| Case | Behavior |
| --- | --- |
| Top factor has weight < 0.20 | Add disclaimer to SME payload: "Top divergent factor is low-confidence; treat as exploratory" |
| Tie between top factors | Route to BOTH teams; first responder owns resolution |
| All factors uncategorized | Fall back to MIA / Jim K. + flag for routing-table review |
| SME unavailable (PTO, vacation) | On-call rota rolls automatically; if no on-call exists, escalate to team alias |
| SME has stale state for > 24h | Auto-escalate to team alias + alert in GovOps dashboard |

## Eval harness design

### Suite overview

Five eval suites, each gated against a specific PRD eval-gate threshold.

| Suite | Cases | Gate | Threshold | Frequency |
| --- | --- | --- | --- | --- |
| `golden_set` | 100 SME-judged disagreements + 40 agreements | Correctness | precision ≥ 85%, recall ≥ 80% | Every PR + nightly |
| `adversarial` | 20 designed-to-fool probes | Adversarial robustness | ≥ 90% correctly classified | Every PR |
| `calibration` | 50 cases with realized SME-confirmation labels | Calibration | R² ≥ 0.7 | Weekly |
| `perf` | 100 runs at peak traffic shape | Perf + cost | p95 latency ≤ 90s; p95 cost ≤ $0.30 | Pre-deploy + weekly |
| `replay` | 50 random production runs replayed | Replay determinism | ≥ 98% reproduce | Weekly |

### Suite 1 · `golden_set`

Location: `tests/golden_set/cases.jsonl`. 140 cases. Curated by Krisztina G. + Jim K. against Q1–Q3 2025 retrospective data with known outcomes.

**Case structure:**

```json
{
  "case_id": "gs-042",
  "forecast_set_id": "FS-2025Q3-NA-TRK-001",
  "primary_snapshot": { "value": 318200, "p10": 292000, "p90": 345000, "sources": [...] },
  "actual_outcome": 304500,
  "expected_label": "disagree",
  "expected_top_factor": "texas_dealer_pulse",
  "expected_top_factor_category": "mia",
  "sme_judge": "krisztina_g",
  "judge_notes": "Texas dealer pulse signal was visible w19 and would have pulled forecast down by ~2k. Primary did not weight this. A bear-case agent should catch.",
  "acceptable_mds_range": [0.32, 0.55]
}
```

**Runner:** `python -m tests.eval golden_set` runs all 140 cases against a service deployment. Outputs:

```
             | precision | recall  | F1
Disagree     | 0.91      | 0.84    | 0.87
Agree        | 0.88      | 0.93    | 0.90

Top-factor accuracy: 0.79
Top-factor-category accuracy: 0.92

GATE: PASS (precision 0.91 ≥ 0.85, recall 0.84 ≥ 0.80)
```

### Suite 2 · `adversarial`

20 designed-to-fool cases. Each crafted by Don S. (GovOps) to exploit a specific failure mode.

| Probe type | Cases | What it tests |
| --- | --- | --- |
| Close-but-different numbers | 5 | Does MDS fire on small but material differences? |
| Similar-looking signal, different cause | 4 | Does the routing correctly distinguish? |
| Same data, different framing | 4 | Does divergent framing actually produce divergence? |
| Stale evidence smuggled in | 3 | Does source-overlap correctly down-weight? |
| Anchor-bias on primary's narrative | 2 | Does second agent resist anchoring? |
| Confidence-band trickery | 2 | Does band-overlap correctly handle one-sided overlap? |

### Suite 3 · `calibration`

50 production cases per quarter with realized SME-confirmation labels. Built incrementally from production data.

**Output:**

```
MDS decile | Predicted confirmation | Realized confirmation | Diff
0.30-0.40  |  60%                   |  62%                  | +2%
0.40-0.50  |  72%                   |  74%                  | +2%
0.50-0.60  |  82%                   |  79%                  | -3%
0.60-0.70  |  90%                   |  91%                  | +1%
0.70+      |  95%                   |  94%                  | -1%

R² against linear fit: 0.83

GATE: PASS (R² 0.83 ≥ 0.70)
```

If R² < 0.70 for 2 consecutive weeks, GovOps triggers recalibration. See runbook `calibration_drift.md`.

### Suite 4 · `perf`

100 runs at production peak traffic shape (~50 concurrent runs at S&OP Gate 3 window).

**Output:**

```
              | p50    | p95    | p99    | max
Latency (ms)  | 38,200 | 78,400 | 88,100 | 91,200
Cost (USD)    | 0.16   | 0.27   | 0.34   | 0.41

GATE: PASS
  p95 latency 78.4s ≤ 90s
  p95 cost $0.27 ≤ $0.30
  Single run breached cap ($0.41) — within tolerance (1/100)
```

### Suite 5 · `replay`

50 random sampled production runs replayed from HIBT. Each replay re-loads the exact prompt pack, source weights, and model parameters used, and re-invokes the LLM.

**Output:**

```
Replays attempted:      50
Identical recommendation: 49
Identical MDS (±0.02):    48
Deterministic factors:   47

Reproducibility rate: 49/50 = 98%

GATE: PASS (98% ≥ 98%)
```

Replay failures are investigated individually; if any failure correlates with a model version change, that change is rolled back.

### CI integration

`.github/workflows/eval-gates.yml`:

```yaml
name: eval-gates

on:
  pull_request:
    paths:
      - 'app/**'
      - 'prompts/**'
      - 'tests/**'

jobs:
  golden_set:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build service
        run: docker compose build
      - name: Spin up service
        run: docker compose up -d
      - name: Run golden set
        run: python -m tests.eval golden_set --gate
      - name: Comment on PR with results
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = fs.readFileSync('eval-results.md', 'utf8');
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: results
            });

  adversarial:
    runs-on: ubuntu-latest
    needs: golden_set
    steps: [ /* same pattern */ ]

  perf:
    runs-on: ubuntu-latest
    if: github.event.pull_request.base.ref == 'main'
    steps: [ /* same pattern, longer timeout */ ]
```

**PR merge gate:** Any failure in `golden_set` or `adversarial` blocks merge. `perf` runs only on main-targeting PRs.

**Nightly:** All 5 suites run against the canary environment. Results posted to Slack `#nama-pit-wall-ops` + dashboard.

## API contract · finalized

### POST `/api/v2/forecasts/{forecast_set_id}/second-opinion`

**Purpose:** Invoke a Second-Opinion Agent run.

**Auth:** Bearer token. Decision-rights scope: `second-opinion.invoke`.

**Request body:**

```json
{
  "trigger": "manual",
  "context": {
    "override_draft_id": "od_2026q3_silv_001",
    "approval_card_id": null,
    "scenario_id": "sc_base_2026q3"
  },
  "prompt_pack": "divergent_v1",
  "max_latency_ms": 90000,
  "async": true
}
```

**Response (202 Accepted, async path — 99% of requests):**

```json
{
  "run_id": "so_run_abc123",
  "status": "running",
  "started_at": "2026-05-12T14:30:00Z",
  "poll_url": "/api/v2/forecasts/FS-.../second-opinion/so_run_abc123",
  "estimated_completion_seconds": 75
}
```

**Response (200 OK, sync immediate path — cache hit, <1% of requests):**

Full completed result — see GET response schema below.

**Error responses:**

| Code | Body | When |
| --- | --- | --- |
| 400 | `{"error":"invalid_request", "detail": "..."}` | Invalid payload, missing scenario_id, etc. |
| 401 | `{"error":"unauthorized"}` | Bad/missing auth |
| 403 | `{"error":"forbidden", "required_scope":"second-opinion.invoke"}` | Decision-rights denied |
| 409 | `{"error":"run_in_progress", "existing_run_id":"..."}` | Same context already has running run |
| 429 | `{"error":"budget_exceeded", "seat":"analyst_42", "reset_at":"..."}` | Per-seat daily budget breached |
| 503 | `{"error":"service_unavailable", "retry_after_seconds": 30}` | LLM upstream down; graceful degradation |

### GET `/api/v2/forecasts/{forecast_set_id}/second-opinion/{run_id}`

**Purpose:** Poll status / retrieve completed run.

**Auth:** Bearer token. Decision-rights scope: `second-opinion.read` (broader than `.invoke` — SMEs receiving routes can read).

**Response (still running, 200 OK):**

```json
{
  "run_id": "so_run_abc123",
  "status": "running",
  "started_at": "2026-05-12T14:30:00Z",
  "elapsed_seconds": 42,
  "progress": "llm_invocation"
}
```

**Response (completed, 200 OK):**

```json
{
  "run_id": "so_run_abc123",
  "status": "completed",
  "started_at": "2026-05-12T14:30:00Z",
  "completed_at": "2026-05-12T14:31:18Z",
  "duration_ms": 78320,
  "primary": { "value": 312400, "p10": 287600, "p90": 338900 },
  "second_opinion": { "value": 304200, "p10": 281400, "p90": 328500 },
  "delta": -8200,
  "mds": 0.37,
  "mds_components": {
    "point_delta_norm": 0.160,
    "band_overlap": 0.711,
    "source_overlap": 0.333,
    "factor_count_norm": 0.600
  },
  "divergent_factors": [
    {"factor":"texas_dealer_pulse","category":"mia","weight":0.34,"evidence_links":[...]},
    {"factor":"sierra_hd_cross_shop","category":"mia","weight":0.28,"evidence_links":[...]},
    {"factor":"competitive_launch_ev","category":"mia","weight":0.19,"evidence_links":[...]}
  ],
  "challenge_raised": true,
  "challenge_id": "ch_so_2026q3_001",
  "suggested_route": {
    "sme_team": "mia",
    "specific_sme": "jim_kyle",
    "top_factor": "texas_dealer_pulse",
    "top_factor_weight": 0.34,
    "fallback": false
  },
  "rationale": "Texas dealer pulse signal w19 (cited in /MIA/dealer-pulse-week19.pptx) and Sierra HD cross-shop trend suggest Silverado HD volume is overstated by ~2k units. Competitive EV launch calendar shows F-150 Lightning incentive shift in late June that primary did not weight.",
  "cost_usd": 0.18,
  "prompt_pack": "divergent_v1",
  "hibt_entry_id": "hibt_42abf2"
}
```

**Response (failed, 200 OK — not 5xx, this is a successful query of a failed run):**

```json
{
  "run_id": "so_run_abc123",
  "status": "failed",
  "started_at": "2026-05-12T14:30:00Z",
  "failed_at": "2026-05-12T14:31:30Z",
  "failure_reason": "llm_timeout",
  "failure_detail": "LLM did not respond within 75-second timeout",
  "degraded": true,
  "hibt_entry_id": "hibt_42abf2"
}
```

### POST `/api/v2/forecasts/{forecast_set_id}/second-opinion/{run_id}/dismiss`

**Purpose:** Owner dismisses a raised challenge with reason code.

**Auth:** Decision-rights scope: `second-opinion.dismiss` (Analyst on own runs; Owner on any).

**Request body:**

```json
{
  "reason_code": "DISM-3",
  "note": "Already considered — we discussed this exact dealer pulse in the Pricing committee Tuesday."
}
```

**Response (200 OK):**

```json
{
  "run_id": "so_run_abc123",
  "dismissed_at": "2026-05-12T14:35:00Z",
  "dismissed_by": "krisztina_g",
  "reason_code": "DISM-3",
  "hibt_entry_id": "hibt_42abf3"
}
```

### Retry semantics

- **Idempotency-Key header recommended** on POST. Same key + same body within 60 sec returns existing run (200 with full result, or 202 still running).
- **Retry on 503** with exponential backoff: 1s, 2s, 4s, max 3 retries.
- **Never retry on 4xx** (validation errors are permanent).
- **Never retry on 429** (budget is permanent for the day; user-facing message instead).

### Streaming variant (future)

`GET /api/v2/forecasts/{forecast_set_id}/second-opinion/{run_id}/stream` — Server-Sent Events for live progress. Out of scope for v1.0. Polling is sufficient at 90s SLA.

### Rate limits

- 5 invocations per user per minute (burst)
- 30 invocations per user per hour (sustained)
- 100 invocations per forecast set per day (global cap)

Limits enforced by API gateway. 429 with `Retry-After` header.

## Data model · finalized DDL

### `second_opinion_runs`

```sql
CREATE TABLE second_opinion_runs (
  id                  UUID         PRIMARY KEY DEFAULT gen_uuid_v7(),
  forecast_set_id     UUID         NOT NULL REFERENCES forecast_sets(id),
  trigger             TEXT         NOT NULL CHECK (trigger IN ('manual', 'auto_gate3')),
  triggered_by        TEXT         NOT NULL,                       -- user_id
  scenario_id         UUID         NOT NULL REFERENCES scenarios(id),
  prompt_pack         TEXT         NOT NULL,                       -- e.g. 'divergent_v1'
  prompt_pack_hash    TEXT         NOT NULL,                       -- SHA256 of pack contents at run time
  primary_value       NUMERIC,
  primary_p10         NUMERIC,
  primary_p90         NUMERIC,
  second_value        NUMERIC,
  second_p10          NUMERIC,
  second_p90          NUMERIC,
  mds                 NUMERIC      CHECK (mds >= 0 AND mds <= 1),
  mds_components      JSONB,                                       -- {point_delta_norm, band_overlap, source_overlap, factor_count_norm}
  source_overlap_pct  NUMERIC,
  cost_usd            NUMERIC,
  latency_ms          INTEGER,
  status              TEXT         NOT NULL CHECK (status IN ('running','completed','failed')),
  failure_reason      TEXT,                                        -- null if status != 'failed'
  challenge_id        UUID         REFERENCES challenges(id),
  rationale           TEXT,
  hibt_entry_id       TEXT         NOT NULL,                       -- HIBT replay-prompt-ledger row ID
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ
) PARTITION BY RANGE (created_at);

-- Monthly partitions, auto-created by pg_partman
CREATE INDEX so_runs_fs_idx        ON second_opinion_runs (forecast_set_id);
CREATE INDEX so_runs_actor_idx     ON second_opinion_runs (triggered_by, created_at DESC);
CREATE INDEX so_runs_status_idx    ON second_opinion_runs (status, created_at DESC);
CREATE INDEX so_runs_challenge_idx ON second_opinion_runs (challenge_id) WHERE challenge_id IS NOT NULL;
```

### `disagreement_scores`

```sql
CREATE TABLE disagreement_scores (
  id              UUID         PRIMARY KEY DEFAULT gen_uuid_v7(),
  run_id          UUID         NOT NULL REFERENCES second_opinion_runs(id) ON DELETE CASCADE,
  factor          TEXT         NOT NULL,
  category        TEXT         NOT NULL CHECK (category IN ('pricing','mia','ops','tariff','competitive','fleet','macro','external_affairs','data-science')),
  weight          NUMERIC      NOT NULL CHECK (weight >= 0 AND weight <= 1),
  evidence_links  TEXT[],
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ds_run_idx ON disagreement_scores (run_id);
CREATE INDEX ds_factor_idx ON disagreement_scores (factor);
CREATE INDEX ds_category_idx ON disagreement_scores (category);
```

### `so_dismissals`

```sql
CREATE TABLE so_dismissals (
  id              UUID         PRIMARY KEY DEFAULT gen_uuid_v7(),
  run_id          UUID         NOT NULL UNIQUE REFERENCES second_opinion_runs(id) ON DELETE CASCADE,
  dismissed_by    TEXT         NOT NULL,
  reason_code     TEXT         NOT NULL CHECK (reason_code IN ('DISM-1','DISM-2','DISM-3')),
  note            TEXT,
  hibt_entry_id   TEXT         NOT NULL,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX sod_user_idx ON so_dismissals (dismissed_by, created_at DESC);
CREATE INDEX sod_reason_idx ON so_dismissals (reason_code);
```

### Indexes & partitioning summary

- `second_opinion_runs` partitioned by `created_at` monthly — 24 partitions retained, older dropped (24-month retention per CC-5)
- Hot path queries:
  - Get run by ID — PK lookup
  - List runs for forecast set — `so_runs_fs_idx`
  - User's daily runs — `so_runs_actor_idx` + date filter
  - Status dashboard — `so_runs_status_idx`
- Disagreement breakdown queries served by `ds_*` indexes
- Dismissal analytics by `sod_*` indexes

### Retention policy

- **24 months** of full-detail rows in `second_opinion_runs` and related tables
- After 24 months, summary stats migrated to `so_runs_archive` (aggregated by month × forecast_set × trigger type)
- HIBT entries retained indefinitely (separate retention policy)
- Personally-identifiable user_ids preserved within the data; removal on user-account-deletion event (rare)

### Migration plan

All three tables are **additive** — no changes to existing v2.4 tables. Migration script `migrations/20260512_second_opinion_init.sql` runs against staging → canary → prod. No downtime required.

### Backfill

No backfill required. Service starts with empty tables; runs accumulate as users invoke.

Exception: golden_set cases are seeded into a separate test schema (`so_test`) for eval harness use. Never visible in production queries.

## Deployment plan

### Environments

| Environment | Namespace | LLM | Forecast data | Feature flag |
| --- | --- | --- | --- | --- |
| **dev** | `pw-dev` | Mock LLM (deterministic fixtures) | Synthetic | always ON |
| **staging** | `pw-staging` | Real LLM | Synthetic forecast data + 5 sandboxed analyst test users | always ON |
| **canary** | `pw-prod-canary` | Real LLM | Real forecast data | per-seat opt-in (10% → 50% rollout) |
| **prod** | `pw-prod` | Real LLM | Real forecast data | per-seat opt-in (eventually default ON post-GA) |

### Feature-flag tactics

Flag: `pw.second-opinion`

States:

- `off` — service does not load; button hidden
- `enabled_for_seat:{seat_id}` — individual user override
- `enabled_for_team:{team_id}` — team rollout
- `percentage_rollout:{pct}` — percentage of eligible seats randomly selected (deterministic by seat_id hash for stability)
- `on` — all seats; manual invocation always available, auto-trigger respects threshold ($50M materiality)

**Kill switch:** Flag toggle to `off` returns traffic to v2.4 path immediately. p99 cutover < 60 seconds (CC-6).

### Phase mapping (from PRD CC-4 / Feature 1 rollout)

| Phase | Weeks | Flag state | Eligible seats |
| --- | --- | --- | --- |
| P1 — Internal QA | 1–3 | `enabled_for_team:nama-internal` | Bob, Krisztina, Jim, Mansoor, Govinda, Don |
| P2 — Canary 10% | 4 | `percentage_rollout:10` (Analyst seats only) | ~3 of 30 analysts |
| P3 — Expanded canary 50% | 5–6 | `percentage_rollout:50` (Analyst + Leadership) | ~15 analysts + ~5 leaders |
| P4 — GA | 7 | `on` | All seats |
| P5 — Tune | 8–12 | `on` (calibrate thresholds) | All seats |

Flag changes go through GovOps approval ticket. Audit trail in feature-flag service.

### Deployment pipeline

```
PR merged to main
      │
      v
GitHub Actions builds container image
      │
      v
Image pushed to nama-registry (signed)
      │
      v
ArgoCD detects new image → deploys to dev
      │
      v
Auto-promote to staging if dev smoke tests pass (1h hold)
      │
      v
Manual approval ticket required for canary promotion (Govinda + Don)
      │
      v
Canary deploy with 1h soak → auto-promote to prod if SLOs hold
      │
      v
Prod deploy (rolling, 3 replicas)
```

Prod deploy strategy: rolling, max-surge 1, max-unavailable 0. Health check on `/health` endpoint. PreStop hook drains in-flight runs (≤90s) before pod terminates.

### Capacity

v1.0 launch sizing:

- **Pods:** 3 replicas (prod) + 2 (canary)
- **CPU:** 1 vCPU per pod (mostly I/O-bound waiting on LLM)
- **Memory:** 2 GB per pod
- **Redis:** Existing nama-redis cluster, +200 MB working set
- **LLM QPS allocation:** 6 QPS (within v3.0 total budget of 18 QPS)

Scale-out triggers: queue depth > 5 sustained 2 min → add pod. Max 10 pods.

### Configuration

All config env-driven. No hardcoded secrets.

```bash
# Service
SO_MODEL=anthropic/claude-opus-4.7
SO_DEFAULT_PROMPT_PACK=divergent_v1
SO_TIMEOUT_MS=75000
SO_BUDGET_DAILY_CAP=4.00
SO_BUDGET_ALERT_PCT=0.80
SO_BUDGET_HARD_CAP_PCT=1.10

# Infra
REDIS_URL=redis://nama-redis:6379/3
PG_URL=postgresql://...
PROMPT_BUCKET=s3://nama-prompts/second-opinion/
HIBT_URL=https://hibt.nama-internal/v2
ONCALL_URL=https://oncall.nama-internal/v1

# Auth
SO_AUTH_ISSUER=https://auth.nama.gm/...
SO_REQUIRED_SCOPES=second-opinion.invoke,second-opinion.read

# LLM
LITELLM_BASE_URL=https://litellm.nama-internal
LITELLM_API_KEY=<secret>
```

Secrets via Kubernetes Secrets, populated from Vault.

### Rollback

Four rollback dimensions, ordered by speed:

1. **Feature flag off** (≤60 sec) — stop new invocations; existing runs continue; no traffic to service
2. **Service drain + previous image redeploy** (≤5 min) — ArgoCD rollback to prior image
3. **Prompt pack rollback** (≤2 min) — environment variable change to `divergent_v0` (preserved historical pack)
4. **Schema rollback** (manual; rare) — tables are additive, simply drop them; no data dependencies in v2.4

Decision tree posted in `runbooks/incident_decision_tree.md`.

### Day-1 launch checklist (P4 → GA)

- [ ] All eval gates green for 7 consecutive days
- [ ] Canary 50% running 14 days with no P1 incidents
- [ ] SME-confirmation rate ≥ 70% sustained 7 days
- [ ] Cost per run ≤ $0.20 sustained 7 days
- [ ] Replay determinism ≥ 98% on weekly sample
- [ ] Runbooks reviewed and dry-run by on-call engineer
- [ ] GovOps drift watch dashboard verified green
- [ ] Sponsor sign-off (Ramzi)
- [ ] Architect sign-off (Bob)
- [ ] GovOps sign-off (Don)
- [ ] Slack `#nama-pit-wall-launch` notified 24h before flip
- [ ] Status page updated at launch time

## Runbook stubs

Four runbooks. Each follows the same template: **Symptom → Likely causes → Immediate mitigation → Investigation → Permanent fix**.

### `budget_breach.md`

**Symptom:** Users report 429 errors. Slack `#nama-pit-wall-ops` shows budget-warn alert at 80% then budget-exceeded at 110%.

**Likely causes:**

1. Spike in Gate 3 commits at month-end S&OP (expected periodic; check `gate3.commit.pending` event rate)
2. New user with high-volume usage pattern (analyst gaming or genuine power user)
3. LLM cost regression (provider pricing change or model swap not reflected in `est_cost`)
4. Bug: budget enforcer not deducting (check Redis key TTL)

**Immediate mitigation:**

- For affected user: respond in Slack with "Reset at midnight ET. Contact GovOps for raise if needed for active S&OP cycle."
- If multiple users affected on same day: temporary global cap raise to 6.00/day, alert sponsor; revert after 24h
- If LLM cost regression suspected: pin LLM model to known-good version, redeploy

**Investigation:**

1. Query `SELECT triggered_by, SUM(cost_usd) FROM second_opinion_runs WHERE created_at >= today() GROUP BY triggered_by ORDER BY 2 DESC LIMIT 10;`
2. Check Redis: `redis-cli KEYS 'so_budget:*:$(date +%Y-%m-%d)'`
3. Check LLM provider dashboard for unexpected per-token pricing changes
4. Check `disagreement_scores` row count vs. cost — anomaly = bug in cost estimation

**Permanent fix paths:**

- Recalibrate per-seat default cap if power-user pattern is legitimate
- Update `est_cost` estimator if LLM pricing changed
- Add anomaly detection for cost regression

**Escalation:** If budget breach persists > 1 hour with no clear cause, escalate to Mansoor + Govinda.

---

### `latency_spike.md`

**Symptom:** p95 latency dashboard breaches 100s sustained 30 minutes. Users report "second opinion still loading" UX complaints.

**Likely causes:**

1. LLM provider degradation (check provider status page)
2. Increased queue depth (auto-trigger fan-out during Gate 3 window)
3. Prompt pack growth (recently updated pack added too much context)
4. Postgres slow query (rare; check `pg_stat_statements`)
5. Network egress to LLM provider (check egress metrics)

**Immediate mitigation:**

- Check LLM provider status; if degraded, switch to fallback provider (config: `SO_MODEL_FALLBACK`)
- Scale up service pods to 6-8 if queue depth > 5
- If single forecast set is responsible (e.g., FS-XXX repeatedly retried): manually mark that forecast set as `so_disabled` temporarily
- If overall traffic is the cause: lower percentage rollout to 25% temporarily

**Investigation:**

1. Grafana dashboard `second-opinion-svc` → latency breakdown by step
2. Check LLM step latency specifically (`llm_invocation` panel)
3. Tail logs for slow runs: `kubectl logs -f deployment/second-opinion-svc | grep "duration_ms"`
4. Run `tests/perf` against canary to isolate service-side issue

**Permanent fix paths:**

- LLM provider issue: implement automatic provider failover (currently manual)
- Prompt pack growth: enforce max-context check in CI
- Queue management: implement smarter dispatch (priority queue for sync requests)

**Escalation:** If LLM provider is the cause and degradation > 2 hours, communicate to sponsor; consider P4 → P3 rollback to reduce blast radius.

---

### `replay_drift.md`

**Symptom:** Nightly replay determinism dashboard shows < 98%. Some runs no longer reproduce identical output from HIBT.

**Likely causes:**

1. LLM model version change (most common — providers silently update underlying model)
2. Prompt pack changed without version bump (operator error)
3. Source data changed retroactively (rare; HIBT should snapshot)
4. Time-dependent input in prompt (e.g., "today" injected as date)
5. Random seed not pinned (model_params.yaml regression)

**Immediate mitigation:**

- Pin LLM model to specific dated version (e.g., `claude-opus-4.7-2026-05-01`)
- Verify prompt pack hash in `second_opinion_runs.prompt_pack_hash` matches S3 object hash
- Pause auto-trigger until replay rate recovers

**Investigation:**

1. Identify drifted runs: `SELECT id, prompt_pack_hash FROM second_opinion_runs WHERE created_at > now() - interval '7 days' AND ...`
2. Compare run-time hash to current S3 pack hash
3. Check LLM provider release notes for silent model updates
4. Spot-check 5 drifted runs by manual replay

**Permanent fix paths:**

- Always pin to dated LLM model version, never use `latest`
- Enforce prompt pack hash check on every run; reject if mismatched
- Snapshot source data inputs into the run record (small overhead, big determinism win)
- Move "today" injection from prompt to structured input (already captured in `created_at`)

**Escalation:** If drift > 5% sustained 24h, escalate to Don S. + Bob R. — may require pack rollback.

---

### `calibration_drift.md`

**Symptom:** Weekly calibration eval shows R² < 0.6, or SME-confirmation rate on raised challenges drops below 60%.

**Likely causes:**

1. Domain shift (forecasting context has materially changed; e.g., new vehicle launch shifts what "normal" looks like)
2. SME response quality degraded (overworked SMEs hitting dismiss without genuine review — check dismissal velocity)
3. MDS weights need recalibration (quarterly cycle missed)
4. Prompt pack drift (framing has become less divergent over time as primary improves)
5. Routing changes (top factors going to wrong SMEs who then dismiss as not their domain)

**Immediate mitigation:**

- Trigger MDS recalibration job manually: `make recalibrate-mds`
- Notify affected SMEs in Slack with calibration status — request thoughtful response cadence
- If routing is the cause: temporarily route everything to MIA / Jim K. while routing table is reviewed

**Investigation:**

1. Query confirmation rate by routed team: `SELECT route_team, ...`
2. Check dismissal velocity per SME (high velocity + DISM-1 = likely SME fatigue or wrong SME)
3. Run calibration suite locally with last 4 weeks of production runs
4. Sample 10 dismissed challenges — was the dismissal correct? (Don S. + Krisztina audit)
5. Compare to a control window (e.g., 90 days ago, when calibration was healthy)

**Permanent fix paths:**

- Weight recalibration via grid search on golden set + recent production data
- Routing table audit (Jim K. quarterly cadence)
- Prompt pack framing rotation (Don S. owns)
- SME workload audit — if dismissal velocity is the cause, that's an org problem not a tech one

**Escalation:** If R² < 0.5 sustained 2 weeks, kill-switch the auto-trigger (manual remains available) until recalibration ships.

## Open questions · decision log

### Locked decisions (do not relitigate without sponsor signoff)

| # | Decision | Rationale |
| --- | --- | --- |
| L-1 | Dedicated service, not a config variant of primary | Blast-radius isolation, independent eval lifecycle, separate budget tracking (Eng Spec stub) |
| L-2 | Different LLM provider for second opinion than primary | Two levers (framing + provider) produce meaningful divergence; one alone is insufficient (this doc § prompt pack) |
| L-3 | Auto-trigger blocks Gate 3 commit when MDS ≥ 0.3 | Material disagreement on plan-of-record is exactly when human signoff matters (PRD FR-SO-7) |
| L-4 | Cost cap is per-seat-daily, not per-org | Aligns budget pressure with the seat invoking; prevents one user's gaming from starving others (CC-7) |
| L-5 | Replay determinism ≥ 98% is non-negotiable | Auditability requirement from PRD; without it the feature loses GovOps trust (eval-SO-5) |
| L-6 | Service failure NEVER blocks primary forecasting path | Graceful degradation; second-opinion is value-add, not gate-keeper (this doc § sequence diagrams) |

### Open questions for engineering review (pre-implementation)

| # | Question | Owner | Resolution by |
| --- | --- | --- | --- |
| Q-1 | Litellm vs. direct provider SDK — abstraction cost vs. latency | Mansoor A. | Week 1 of build |
| Q-2 | Which specific LLM provider for second opinion? Anthropic Opus (default), OpenAI GPT-4 alt, Google Gemini alt? | ML eng lead + Don S. | Week 1 |
| Q-3 | Materiality threshold — $50M is the v1.0 default. Per-nameplate override needed? | Krisztina G. + Ramzi | Week 2 |
| Q-4 | Streaming results to UI — polling vs. SSE — polling is simpler, SSE is nicer UX | Frontend lead | Week 3 |
| Q-5 | Multi-region deployment — NAMA is US-only but if EU forecasting comes in scope, plan? | Govinda C. | Out of scope for v1.0, capture for v3.5 |
| Q-6 | Source-overlap calculation — should we weight sources by their primary-weight? Current implementation is unweighted Jaccard. | ML eng lead | Week 2 |
| Q-7 | Should auto-trigger fire during P3 canary, or only post-GA? PRD says auto-trigger at $100M during P3 | Don S. | Week 4 (before P3) |

### Resolved during this doc draft

| # | Question | Resolution |
| --- | --- | --- |
| R-1 | Bear-case vs. bull-case vs. bottom-up framing for v1.0 | Bear-case (FRAMING [C]) — PRD goal is to surface disagreements that primary missed; bear-case bias maximizes that surface area at v1.0 |
| R-2 | How many divergent factors in payload to SME? | All factors with weight > 0.1, max 5. Top one becomes routing key. |
| R-3 | Async-only or sync-fast-path? | Async-only for v1.0. Sync 200 path reserved for future cache-hit optimization. |
| R-4 | Dismiss reason codes — how many? | Three (DISM-1 spurious, DISM-2 stale, DISM-3 already-considered). PRD-aligned. Avoid sprawl. |
| R-5 | Should pack version be tied to MDS weight version? | Yes — weights are baked into the pack (`mds_weights.yaml`). Recalibrate → pack bump → eval gate. |

### Future considerations (v3.5+)

- Multi-agent ensemble (3+ opinions, not just 2)
- Adversarial fine-tuning loop (train pack-specific model variant on golden set)
- Cross-region second opinion (EU × NAMA cross-check on global product launches)
- Self-improving routing table (ML-learned from SME response patterns)
- User-configurable prompt packs (advanced users select bear/bull/bottom-up per invocation)

These are explicit out-of-scope for v3.0. Captured here for future PRD authors.

## HIBT · provenance · version log

### Version history

| Version | Timestamp · UTC | Author | Prompt summary | Outcome |
| --- | --- | --- | --- | --- |
| **v1.0** | 2026-05-12 | Bob Rapp + Claude (Opus 4.7) | Draft the full per-feature design doc for the Second-Opinion Agent — expanding the stub-depth spec into implementation-grade detail: sequence diagrams, prompt pack contents, eval harness design, deployment plan, runbook stubs. | This document. Implementation-grade detail. |

### Build inputs

- **Companion PRD**: NAMA Pit Wall v3.0 — Delighters PRD Addendum (Feature 1 section)
- **Engineering spec stub**: NAMA Pit Wall v3.0 — Engineering Spec Stub (Feature 1 · Second-Opinion Agent section)
- **Source artifacts**: NAMA Pit Wall v2.4 application + sponsor deck + executive one-pager
- **Domain references**: existing v2.4 service patterns (workbench-anomaly v3.5, narrative-drafter v2.3)

### Recreation notes

If this design doc needs to be regenerated:

1. Start with the v3.0 Delighters PRD Feature 1 section — it defines what's being built
2. Start with the v3.0 Engineering Spec Stub Feature 1 section — it defines the shape
3. This doc expands stub-depth into implementation-grade. Don't go deeper than that — individual subsystem docs handle internals
4. Preserve the **6 locked decisions** in the Open Questions section. Each had a clear rationale.
5. Preserve the **sequence diagrams** — they're the reference for service behavior
6. Preserve the **divergent_v1 pack design** — framing + source weights + model params is the core innovation; do not simplify to just "different prompt"
7. Preserve the **MDS formula** with its four weighted components — every component does specific work
8. Preserve the **eval harness 5-suite structure** — each suite gates a specific PRD eval criterion
9. Maintain implementation-grade depth without crossing into per-subsystem docs (those are the next step)

### Human edits outside the AI loop

None in v1.0. Track in subsequent versions as engineering review feedback is incorporated.

### Sign-off chain

| Phase | Signer | Date |
| --- | --- | --- |
| Design doc draft | Bob Rapp | 2026-05-12 |
| Engineering review | Mansoor A. + Govinda C. + ML eng lead | _pending_ |
| Domain review | Krisztina G. + Jim K. | _pending_ |
| Eval gate review | Don S. | _pending_ |
| Implementation start | ML eng lead | _pending P1 start_ |
| Sponsor signoff at GA | Ramzi A. | _pending P4_ |

### Companion artifacts (when built)

- `runbooks/budget_breach.md` (full)
- `runbooks/latency_spike.md` (full)
- `runbooks/replay_drift.md` (full)
- `runbooks/calibration_drift.md` (full)
- `runbooks/incident_decision_tree.md` (new)
- `prompts/divergent_v1/` full pack contents
- `tests/golden_set/cases.jsonl` (140 cases curated by Krisztina + Jim)
- `tests/adversarial/probes.jsonl` (20 probes designed by Don S.)
- Per-subsystem internal docs (handler, runner, mds, router, llm-client — 5 docs at internal API depth)

The scope of v1.0 of this design doc is sufficient for an engineering team to:

1. Build the service skeleton (week 1)
2. Build the prompt pack and eval harness in parallel (week 2)
3. Wire integration tests and CI gates (week 3)
4. Begin canary deployment (week 4)

The per-subsystem internal docs are produced **during the build**, not before. They capture decisions made during implementation, not predicted ones. This is intentional — over-specification slows down good engineering.

### Owners · curators · RACI anchors

| Role | Owner |
| --- | --- |
| Design doc owner | Bob Rapp |
| Implementation lead | ML eng lead (TBD per staffing decision) |
| Backend partner | Mansoor Alghooneh |
| API + data partner | Govinda Chaluvadi |
| Eval gate owner | Don S. (GovOps) |
| Domain expert | Krisztina Gilezan |
| SME routing validator | Jim Kyle |
| Sponsor | Ramzi Abdelmoula |
