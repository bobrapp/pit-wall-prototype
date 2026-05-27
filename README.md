# 🏁 Pit Wall v4.0 — Forecast Intelligence Platform

> **Simpler. Safer. Deeper data quality. Every team member, every surface they already use.**

The Pit Wall is a conversational-first, surface-aware forecast intelligence platform for NAMA vehicle demand forecasting. It replaces one-size-fits-all dashboards with personalized engagement — meeting each team member in Slack, Outlook, Teams, Glean, Excel, PowerPoint, Power BI, SharePoint, Copilot Agents, or Databricks — while deepening data quality evaluation and maintaining a complete AI audit trail (HIBT).

---

## What's New in v4.0

| Area | v2.4/v3.0 | v4.0 |
|---|---|---|
| **Primary experience** | Workbench web app | All surfaces first-class (Slack, Outlook, Teams, Glean, Copilot, Excel, PBI, SharePoint, PPT) |
| **Data quality** | Basic staleness flags | 6-dimension DQ score, cross-surface consistency, lineage hash, replay accuracy |
| **Engagement mode** | Analyst logs into app | Analyst picks their surface; forecasting happens where they already work |
| **Override flow** | Form in Workbench | In-surface (Slack /pitwall, Outlook reply, Teams adaptive card, Excel cell, Copilot chat) |
| **Personal delighters** | Championship table only | Per-person dashboard, Ghost Lap personal accuracy history, AI personal digest, Lap Clap |
| **Conversation** | None | End-to-end AI conversation in any surface — ask, modify, guess, confirm, evaluate |
| **Repo structure** | Strategy + specs | Full clean-break reorganization (see below) |

---

## Repository Structure (v4.0)

```
pit-wall-prototype/
├── README.md                          ← This file
│
├── 00-design-system/                  ← Tokens, brand, surface guide
│   ├── design-tokens.md
│   ├── surface-catalog.md             ← 10 engagement surfaces defined
│   └── persona-guide.md              ← Leadership / Analyst / SME / Ops / GovOps
│
├── 01-product/                        ← Strategy and narrative
│   ├── strategic-narrative.md        ← (from 01-strategic-narrative)
│   ├── story-arc.md                  ← (from 02-story-arc)
│   └── v4.0-redesign-spec.md         ← *** NEW — this release ***
│
├── 02-features/                       ← Feature PRDs
│   ├── f1-ghost-lap.md
│   ├── f2-second-opinion.md
│   ├── f3-championship-table.md
│   ├── f4-data-quality-engine.md      ← NEW
│   ├── f5-conversation-surfaces.md   ← NEW
│   └── f6-personal-delighters.md     ← NEW
│
├── 03-engineering/                    ← Technical specs
│   ├── architecture.md               ← 4-layer + 10-surface extension
│   ├── data-quality-spec.md          ← DQ score algorithm, lineage, cross-surface sync
│   ├── conversation-api.md           ← Surface adapter contracts
│   ├── second-opinion-design-doc.md  ← (from 03-strategic-specs)
│   ├── engineering-spec-stub.md      ← (from 03-strategic-specs, updated)
│   └── hibt-audit-spec.md            ← NEW — immutable ledger, 7yr retention
│
├── 04-apps/                           ← Deployable prototypes
│   ├── lovable/                       ← Analyst persona (this app)
│   │   └── pit-wall-lovable-app.html
│   ├── replit/                        ← Engineering sandbox README
│   │   └── README.md
│   └── figma-make/                    ← Leadership persona README
│       └── README.md
│
├── 05-surface-adapters/               ← Per-surface integration specs
│   ├── slack-bot.md
│   ├── outlook-adaptive-card.md
│   ├── teams-tab.md
│   ├── glean-connector.md
│   ├── copilot-agent.md
│   ├── powerbi-embed.md
│   ├── sharepoint-webpart.md
│   ├── excel-addin.md
│   ├── databricks-widget.md
│   └── powerpoint-export.md
│
├── 06-brand-visuals/                  ← (from 05-brand-visuals)
│
└── 07-governance/                     ← GM enterprise governance
    ├── aigovops-framework.md
    ├── hibt-retention-policy.md
    ├── championship-hr-policy.md
    └── vendor-security-checklist.md
```

---

## The 6-Dimension Data Quality Score

Each forecast carries a DQ score (0-100) computed from six independent dimensions:

| Dimension | Weight | What it measures |
|---|---|---|
| **Source Freshness** | 25% | Age of each input feed vs. staleness threshold |
| **Lineage Completeness** | 20% | % of forecast value traceable to a versioned, hashed source |
| **Override Accuracy History** | 20% | Analyst's MAPE on prior overrides for this nameplate/segment |
| **Cross-Surface Consistency** | 15% | Whether all surfaces show the same value (PBI = Excel = Glean = Workbench) |
| **Replay Determinism** | 10% | HIBT replay ≥98% match to original run |
| **Signal Coverage** | 10% | % of known relevant signals (dealer, tariff, macro, competitive) included |

A DQ score below 70 triggers a yellow warning badge. Below 55 triggers a red block requiring GovOps review before Gate commit.

---

## 10 Engagement Surfaces

Every action in the Pit Wall — confirm a forecast, submit an override, respond to a Second Opinion challenge, view a Ghost Lap, check your Championship ranking — is available on all 10 surfaces:

| Surface | Primary Persona | Action Mode |
|---|---|---|
| **Pit Wall Workbench** (web app) | Analyst, SME | Full UI, all features |
| **Slack Bot** (`/pitwall`, `@pitwall`) | All | Command + DM digest |
| **Outlook Adaptive Card** | Leadership, Analyst | Inline confirm/override in email |
| **Microsoft Teams Tab** | All | Embedded full app in Teams |
| **Copilot Agent** | All | Natural language, proactive push |
| **Glean Connector + Answer Card** | All | Search-first, card-based |
| **Power BI Embedded** | Leadership, Ops | Dashboard + drill-through |
| **SharePoint Web Part** | Leadership | S&OP cycle status page |
| **Excel Add-in** | Analyst, Finance | Cell-level forecast + lineage |
| **Databricks Widget** | Engineering, Data | Raw data + DQ deep dive |

**PowerPoint Export** is available as a one-click action from any surface, generating a presentation-ready slide deck from the current cycle's forecast state.

---

## End-to-End Conversation Flow

A team member can engage the full forecasting lifecycle — from raw data evaluation to Gate 3 commit — entirely within a single conversation in their preferred surface:

```
[Analyst in Slack]
  @pitwall show me Silverado HD
  → PW: Current P50 284,200 · DQ 78 (tariff stale) · 1 SO challenge
  
  @pitwall why is the second opinion lower?
  → PW: [Explains MDS factors + bear case reasoning]
  
  @pitwall I think 267,000 — incentive elasticity confirmed by dealer visit
  → PW: Override logged 267,000 · Reason: incentive elasticity · Confirm?

  @pitwall confirm
  → PW: ✓ Logged to HIBT · Gate 3 unblocked · Ghost Lap updated
```

The same flow works in Outlook (reply-to-confirm), Teams (Adaptive Card buttons), Glean (Answer Card actions), Copilot (natural language), or the Workbench UI.

---

## Three App Builds — Different Personas

### Lovable App (Analyst Persona)
**Path:** `04-apps/lovable/pit-wall-lovable-app.html`  
Rich, polished web app. Full Workbench experience. My Dashboard, Forecasts, Data Quality, Ghost Lap, Second Opinion, Championship, AI Chat, Inbox, Team View. Optimized for daily analyst workflow.

### Replit App (Engineering Persona)
**Path:** `04-apps/replit/`  
Python FastAPI + React sandbox. Data Quality engine internals, HIBT ledger explorer, DQ score algorithm tuner, surface adapter test harness. For engineers building and debugging the platform.

### Figma + Make App (Leadership Persona)
**Path:** `04-apps/figma-make/`  
Read-only executive view. Cycle health at a glance, team performance summary, override impact, Championship Table. Connected via Make.com webhooks to live data. No override capability — view and approve only.

---

## Quickstart

```bash
# Clone
git clone https://github.com/bobrapp/pit-wall-prototype.git
cd pit-wall-prototype

# Run Lovable app (analyst prototype)
open 04-apps/lovable/pit-wall-lovable-app.html

# Read the full redesign spec
open 01-product/v4.0-redesign-spec.md
```

---

## Owners

| Role | Owner |
|---|---|
| Product / Architecture | Bob Rapp |
| Backend + Platform | Mansoor Alghooneh |
| API + Data | Govinda Chaluvadi |
| AI GovOps + Eval | Don S. |
| Forecasting Partner | Krisztina Gilezan |
| SME Routing | Jim Kyle |
| Sponsor | Ramzi Abdelmoula |

---

*Built with AIGovOps Foundation governance framework. HIBT-first. Every AI decision replayable.*
