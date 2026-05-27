# Pit Wall v4.0 — Replit App (Engineering Persona)

## Purpose
The Replit app is the engineering sandbox for building and tuning the Pit Wall platform. It exposes the internals that the Lovable app intentionally hides — the DQ score algorithm, the HIBT ledger, the surface adapter test harness, and the Second Opinion MDS calculator.

## Stack
- **Backend:** Python FastAPI (async)
- **Frontend:** React 18 + Vite
- **Data:** DuckDB for local dev, Unity Catalog (Databricks) for prod
- **Deployment:** Replit (dev), Azure Container Apps (prod)

## Features

### 1. DQ Score Engine Tuner
Adjust dimension weights in real time, see impact on current cycle scores. Drag sliders for freshness, lineage, override_accuracy, consistency, replay, signal_coverage. Live DQ score updates across all forecasts in the cycle.

### 2. HIBT Ledger Explorer
Search and filter the immutable audit log:
- Filter by analyst, nameplate, action type, date range
- Replay any run: re-execute with same inputs, compare outputs
- Export lineage graph as DOT format for visualization
- Surface provenance: see which surface originated each action

### 3. Surface Adapter Test Harness
Mock any surface's inbound action handling:
- Paste a Slack Block Kit payload → see how the adapter interprets it
- Paste an Outlook reply → verify CONFIRM/OVERRIDE/DISMISS parsing
- Test Teams Adaptive Card action payloads
- See how Copilot natural language resolves to structured actions

### 4. Second Opinion MDS Calculator
Input two forecasts (primary + analyst estimate), see the Multi-Dimensional Skepticism breakdown:
- Variance magnitude
- Direction confidence
- Signal gap analysis
- Challenge routing recommendation

### 5. Pipeline Health Dashboard
- Feed staleness by source
- Sync status across all surfaces
- Job queue depth
- Recent HIBT replay results

## Running Locally
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## Running on Replit
1. Fork this folder to a new Replit
2. Set environment variables: `DATABRICKS_TOKEN`, `DATABRICKS_HOST`, `UNITY_CATALOG_SCHEMA`
3. Click Run — Replit auto-detects the `.replit` config

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/forecasts/{cycle_id}` | All forecasts for cycle |
| GET | `/api/forecasts/{id}/dq` | DQ score breakdown |
| GET | `/api/hibt/{id}/lineage` | Lineage graph for forecast |
| POST | `/api/hibt/{id}/replay` | Replay a HIBT run |
| POST | `/api/dq/tune` | Tune DQ weights, get scores |
| POST | `/api/surface/test` | Test surface adapter parsing |
| POST | `/api/second-opinion/mds` | Compute MDS score |
| GET | `/api/pipeline/health` | Feed + sync status |
