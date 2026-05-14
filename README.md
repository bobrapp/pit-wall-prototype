# NAMA Pit Wall — Complete Package

> **One planning brain. Many surfaces. Human judgment preserved.**

This repository is the complete deliverable package for the **NAMA Pit Wall v2.4** — a co-working forecasting platform for GM's North American Markets organization. Five persona seats, eight surfaces, seven NAMA-certified AI agents, one trusted forecast substrate.

**Status:** Pre-engineering deliverable package. Working frontend scaffold + complete strategic specs. Pre-backend; pre-production.

**Version:** v2.4 · 2026-05-12
**Architect:** Bob Rapp
**Sponsor:** Ramzi Abdelmoula

---

## Folder structure

```
pit-wall-prototype/
├── README.md                          ← you are here
├── 01-strategic-narrative/            ← what to read / show first
│   ├── deliverables-index.html        — single-page index of everything (open this first)
│   ├── executive-one-pager.html       — printable letter-portrait brief
│   ├── 12-slide-pitch-deck.html       — cinematic sponsor-review deck
│   ├── v2.4-interactive-app.html      — the working Pit Wall demo
│   └── mega-package-index.html        — index of the 52-file dev package
│
├── 02-story-arc/                      ← the 3-minute experience
│   ├── end-to-end-demo-and-agent-studio.html  — 15-scene walkthrough with chapter picker
│   ├── maya-narration-3min.mp3         — 3-min spoken tour (Kore voice, clean General American)
│   └── demo-narration-3min.mp3         — original demo narration (Charon voice)
│
├── 03-strategic-specs/                ← the v3.0 strategy documents
│   ├── v3.0-delighters-prd-addendum.md  — PRD addendum for the 3 v3.0 features
│   ├── engineering-spec-stub.md         — stub-depth eng spec + honest staffing gap
│   └── second-opinion-agent-design-doc.md  — implementation-grade design for SO Agent
│
├── 04-mega-package/                   ← the 52-file developer-ready monorepo
│   └── nama-pit-wall-mega-package.tar.gz
│       — Untar to access:
│         README · EXEC_SUMMARY · PRD · PRD-FAQ · MRD · PERSONAS · ARCHITECTURE
│         DESIGN_SPEC · ROADMAP · 5 ADRs · OpenAPI 3.1 · Postgres DDL
│         runnable React/Vite/TypeScript scaffold (9 components, typed, mock data)
│         4 runbook stubs · 4 platform export guides (Replit/Lovable/Claude Code/Codex)
│         design tokens · brand pitch deck + one-pager · HIBT build log
│
└── 05-brand-visuals/                  ← cinematic stills + spokesperson portraits
    ├── maya-corporate-portrait-mid40s.jpg   — for everyday use (LinkedIn / intranet / slide)
    ├── maya-cinematic-portrait.jpg          — for editorial moments
    ├── pit-wall-command-center-hero.jpg     — primary brand hero
    ├── workbench-cockpit-overhead.jpg       — workbench section accent
    └── cadillac-cockpit-forecasting.jpg     — leadership-feel accent
```

---

## Quick start by audience

**Sponsor (Ramzi)** — open `01-strategic-narrative/deliverables-index.html` and work through the embedded review checklist.

**Engineering team** — extract `04-mega-package/nama-pit-wall-mega-package.tar.gz`, read its README, then start with `ARCHITECTURE.md` and the OpenAPI spec.

**Forecasting team (Krisztina, Jim)** — open `01-strategic-narrative/v2.4-interactive-app.html`, test all 5 seats, click "Run race" in the 15-minute race section.

**Designers** — see `05-brand-visuals/` for hero imagery + Maya portraits. Design tokens are inside the mega-package tarball at `brand/tokens.css` and `brand/tokens.json`.

**Anyone exploring the whole picture** — open `01-strategic-narrative/deliverables-index.html`. It's the single-page navigation hub.

---

## Operating principle

> Agents do the rework, the research, the toil. Humans do the judgment, the dissent, the commit. The Pit Wall keeps them honest to each other.

---

## What's in each folder, briefly

| Folder | Purpose | Audience |
|---|---|---|
| `01-strategic-narrative/` | Show & tell. The 5 polished deliverables to share with leadership. | Sponsors · execs |
| `02-story-arc/` | The 3-minute experience. Interactive demo + narration audio. | Anyone learning the system |
| `03-strategic-specs/` | The v3.0 vision in three documents. | Product · engineering |
| `04-mega-package/` | The 52-file dev-ready monorepo (compressed tarball). | Engineering team |
| `05-brand-visuals/` | Hero photography + spokesperson portraits. | Marketing · design · brand |

---

## Status, ownership, decision window

| | |
|---|---|
| Build status | Pre-engineering deliverable package complete |
| Decision window | 14 days from sponsor review |
| Signoff required from | Ramzi (sponsor) · Bob (architect) · Don (GovOps) |
| First production code | After Phase 0 sponsor signoff + ML engineer hire |
| First user-facing pilot | Week 4 of build (Forecast Workbench, 3 users) |

---

## Versions

| Version | Status | What ships |
|---------|--------|-----------|
| **v2.4** | Pre-engineering complete (this package) | 5 seats · 15-min race · monthly cycle · HIBT v2.0 spec · Agent Studio |
| **v3.0** | Spec'd; awaiting greenlight | Second-Opinion Agent · Ghost Lap · Championship Table · Constraint twin |
| **v3.5** | Vision only | Strategic 3-5y · auto-S&OP pre-read · external signal marketplace · cross-region wall |

---

## Provenance

Built end-to-end in a single focused thread, May 2026. HIBT-logged per the `aigovops-foundation-rapp-how-i-built-this` discipline. Full build provenance is inside `04-mega-package/nama-pit-wall-mega-package.tar.gz/docs/HIBT_LOG.md`.

— Bob Rapp
