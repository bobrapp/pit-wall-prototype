# Pit Wall v4.0 — Figma Make App (Leadership Persona)

## Purpose
The Figma Make app is the executive view of the Pit Wall platform. No overrides, no editing — just clear signal about cycle health, team performance, and override impact. Designed for VP NAMA, Sponsor, and S&OP review participants who need a quick answer, not a deep dive.

## Stack
- **Frontend:** Figma Make (web app export)
- **Backend connectivity:** Make.com (formerly Integromat) webhooks
- **Data source:** Power BI Embedded + SharePoint lists
- **Export:** One-click PowerPoint generation via Microsoft Graph API

## Screens

### 1. Cycle Health Overview
- All active nameplates, current P50 forecast, DQ score badge, gate status
- One-number cycle health indicator (% of nameplates at Green DQ or better)
- Pending decisions requiring leadership awareness

### 2. Team Performance Summary
- Accuracy by analyst: rolling 6-cycle MAPE vs. primary model
- Override impact: analyst adjustments vs. plan-of-record delta
- Second Opinion resolution rate
- Pending items by owner

### 3. Championship Table
- Current season standings (points + rank)
- Season-to-date accuracy story
- Top override moments (positive impact)

### 4. PowerPoint Export
One-click deck generation for S&OP meeting:
- Title slide with cycle date + AI summary
- Cycle health slide (all nameplates, DQ scores)
- Team performance slide
- Top 3 override stories (you-were-right moments)
- Championship Table slide
- Appendix: data quality detail

Generated via Microsoft Graph API + PowerPoint Open XML template.

## Make.com Scenario Configuration

### Webhook: Cycle State Change
Trigger: Pit Wall API webhook on cycle state change
Actions:
1. Fetch cycle summary from Pit Wall API
2. Update SharePoint list (S&OP status page)
3. Send Outlook notification to Leadership distribution list
4. (Optional) Trigger PowerPoint deck generation

### Webhook: Override Logged
Trigger: HIBT webhook on override action
Actions:
1. Update Power BI dataset via Push Dataset API
2. Refresh SharePoint dashboard data
3. (Optional) Notify sponsor if override exceeds materiality threshold

## Figma Make Setup
1. Import the Figma Make JSON from `figma-make-export.json` (TBD — requires Figma Make Studio access)
2. Connect to the Make.com webhook URLs (see `make-scenario.json`)
3. Publish to your organization's Figma Make workspace
4. Share the published URL in your SharePoint S&OP page as an embedded web part

## Design Notes
This app follows the Pit Wall v4.0 design system (see `00-design-system/`). Executive-clean aesthetic: large numbers, status badges, minimal interaction. Dark mode by default for presentation/executive dashboard contexts. All data read-only for this persona.
