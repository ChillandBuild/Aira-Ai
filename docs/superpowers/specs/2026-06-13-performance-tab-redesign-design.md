# Performance Tab Redesign — Top-Down Daily Report

**Date:** 2026-06-13
**Surface:** Team → Performance (`frontend/app/dashboard/telecalling/components/performance-view.tsx` + `sections/`)
**Audience:** Tenant business owner. Should read like a senior analyst's daily report — easy to scan, not scattered.

## Goal
Re-align the Performance tab into one clean top-down report. Same content as today (nothing dropped), reorganized into six clear zones, and **recover the results-oriented stats** that were lost when the `/analytics` Telecalling tab was removed (Outcome Breakdown, Conversion Rate %, Calls Per Hour).

## Scope
**Frontend only.** Every data point is already in the existing `/analytics/telecalling` response (`api.analytics.telecallingExtended()` → `TelecallingAnalyticsExtended`): `outcome_breakdown`, `calls_per_hour`, `conversions_today`, `comparison { yesterday, avg_7d }`, `per_caller`, etc. No backend change, no new data fetch.

## Structure (six zones, in order)
1. **Headline** — existing `PerformanceHeadline` (one-sentence daily summary).
2. **KPIs** — existing `PerformanceKpis`, **+1 new tile: Conversion %** (= conversions ÷ calls, client-side; delta from the `comparison` block). Tiles: Calls · Connect % · Conversion % · Avg Talk · Idle, each with ↑/↓ deltas vs yesterday & 7-day (idle inverted). Deltas remain gated to the Today view.
3. **Results** *(new zone)*:
   - **Outcome Breakdown** — Converted / Callback / Not Interested / No Answer, 4-way distribution bars, from `outcome_breakdown`.
   - **Calls Per Hour** — team-level hourly volume bar chart, from `calls_per_hour`.
4. **Insights** — existing `PerformanceInsights` (★ top performer · ⚠ idle/bunking · WoW drop).
5. **Agents** — existing **Leaderboard** (sortable) is the entry point; click a caller → **drill-down** (Attendance grid + Shift Timeline), selection-gated as today. Per-caller temporal detail lives here (not in Zone 3).
6. **Tools** — **collapsed by default**: Live Agent Status · QA Review · Bulk Assignment. `LeadProfileModal` stays a modal triggered from within.

## Components
- `performance-view.tsx` — orchestrator; re-sequences sections into the six zones; wraps Zone 6 in a collapsible (default collapsed).
- **New** `sections/OutcomeBreakdown.tsx` — 4-way outcome distribution bars (reads `outcome_breakdown`).
- **New** `sections/CallsPerHour.tsx` — hourly volume bar chart (reads `calls_per_hour`, recharts already used).
- `sections/PerformanceKpis.tsx` — add the Conversion % tile (value + delta).
- Existing sections (`PerformanceHeadline`, `PerformanceInsights`, leaderboard inline, `ShiftTimeline`, attendance grid, `LiveAgentStatus`, `QaReviewFeed`, `BulkAssignment`, `LeadProfileModal`) — reused as-is, just re-placed.
- All files stay < 800 lines.

## Non-goals
- No backend/endpoint changes.
- No removal of any existing section (decision: keep all, reorganize).
- No change to data semantics or the existing deltas/comparison logic.

## Verification
`cd frontend && npx tsc --noEmit` (ignore pre-existing `team/[id]`), `npx eslint <touched>`, `rm -rf .next/types && npx next build` → "✓ Compiled successfully"; `/dashboard/telecalling` stays a `ƒ` route.
