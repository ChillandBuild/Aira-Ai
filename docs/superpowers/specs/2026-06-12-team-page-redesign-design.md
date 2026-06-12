# Team Page Redesign — Design Spec

Date: 2026-06-12

## Overview

Redesign `frontend/app/dashboard/team/` (Team Members / Assignment Log / Performance)
to fix layout bugs, restyle tabs and roster views, replace fake attendance data with
real admin-marked attendance (per-telecaller heatmap on Team page + team-wide grid on
Performance page), and replace the call-volume/outcome-donut charts in the telecaller
profile panel with more analyst-oriented charts.

## Backend

### New table: `caller_attendance_overrides` (migration `107_caller_attendance.sql`)

```sql
create table if not exists public.caller_attendance_overrides (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id),
  caller_id uuid not null references public.callers(id) on delete cascade,
  date date not null,
  status text not null check (status in ('present', 'absent')),
  marked_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (caller_id, date)
);

create index if not exists idx_caller_attendance_tenant on public.caller_attendance_overrides (tenant_id);
create index if not exists idx_caller_attendance_caller_date on public.caller_attendance_overrides (caller_id, date);

alter table public.caller_attendance_overrides enable row level security;
-- follow the same tenant-isolation select policy pattern as caller_status_logs
-- in 089_security_hardening.sql (loop adds this table name to the policy array)
```

### Resolution logic (shared helper, e.g. `services/attendance.py`)

For a given `caller_id` + `date`:
1. If an override row exists for that `(caller_id, date)` → use its `status`.
2. Else, derive from `caller_status_logs`: if any row exists with
   `started_at::date = date` (any status) → `present`; otherwise → `absent`.
3. Dates in the future (`date > today`) → `future` (not present/absent), never derived.

No "break" status — collapses to present/absent/future only, per Hard requirement.

### New endpoints (`backend/app/routes/team.py`, owner-only via `get_tenant_and_role`)

**`GET /api/v1/team/attendance?month=YYYY-MM`**
Team-wide grid for the Performance page.
```json
{
  "data": {
    "callers": [{ "caller_id": "...", "name": "Prem" }, ...],
    "days": ["2026-06-01", "2026-06-02", ...],
    "grid": { "<caller_id>": { "2026-06-01": "present", "2026-06-02": "absent", ... } },
    "summary": {
      "present_today": 2,
      "absent_today": 1,
      "attendance_rate_month": 0.87
    }
  }
}
```

**`GET /api/v1/team/attendance/{caller_id}?months=4`**
Per-caller heatmap data for the Team page profile panel. Returns one entry per day
covering the trailing N months (default 4) up to today, plus today's resolved status.
```json
{
  "data": {
    "caller_id": "...",
    "days": [{ "date": "2026-02-15", "status": "present" }, ...],
    "today_status": "present"
  }
}
```

**`POST /api/v1/team/attendance/{caller_id}`**
Owner-only mark/override. Body: `{ "date": "2026-06-12", "status": "present" }`.
Upserts into `caller_attendance_overrides` (`marked_by = ctx["user_id"]`). Returns the
resolved day entry. Used by the "Mark Attendance" widget from both Team and Performance
pages.

## Frontend

### 1. Search bar overlap fix
`frontend/app/dashboard/team/page.tsx` — the controls bar search input: increase
left padding to clear the `<Search>` icon (icon at `left-3`, input needs `pl-10`+),
verify no double-icon/placeholder collision at the default width.

### 2. Tab redesign (Team Members / Assignment Log / Performance)
Replace the current pill-button tab group with the underline-tab pattern from
`frontend/app/dashboard/outbound-leads/page.tsx` (`border-b-2`, active =
`border-tertiary text-tertiary`, inactive = `border-transparent text-on-surface-muted
hover:text-on-surface`), full-width bottom-bordered row.

### 3. Grid vs List roster sizing
- **Grid view**: reduce avatar size, padding, and spacing so cards are more compact —
  target 3 columns on `lg` screens (currently 2). Score bar and contact rows stay but
  tighter.
- **List view**: increase profile prominence per row — larger avatar, name + role +
  phone + ID + score bar all visible inline, more vertical breathing room. This becomes
  the "detailed roster" view.

### 4/5/7. Attendance (real data, admin-marked, in both pages)

**Team page — per-telecaller profile panel** (`TeamProfilePanel` in `page.tsx`):
- Replace the old `AttendanceCalendar` (hash-based fake data) with a new
  `AttendanceHeatmap` component: GitHub-contribution-style grid — weeks as columns,
  Mon–Sun as rows, ~4 months trailing, fetched from
  `GET /api/v1/team/attendance/{caller_id}?months=4`.
  - Colors: present = filled green, absent = filled rose/red, future = empty/gray.
  - Hover tooltip shows date + status.
  - Legend: Present / Absent only.
- **Mark Attendance** widget directly above/beside the heatmap: date input (default
  today) + Present/Absent toggle buttons, shows the resolved status for the selected
  date, calls `POST /api/v1/team/attendance/{caller_id}` on change and refreshes the
  heatmap + today's status badge.
- Placement: header → KPI cards (Calls Today/Duration/Conversion/Avg Score, kept near
  top per item 5) → Mark Attendance + heatmap → new analyst charts (below) → time
  distribution → activity timeline.

**Performance page** (`performance-view.tsx`):
- New "Team Attendance" section:
  - KPI cards row: Present Today / Absent Today / Attendance Rate (this month) —
    colored cards matching the visible style from screenshot 3.
  - Filters: month picker (defaults to current month) + telecaller filter (All /
    specific).
  - Grid: rows = telecallers (filtered), columns = days in selected month, cell =
    present/absent/future dot (same color scheme as the heatmap, simplified to a
    single-month grid). Sourced from `GET /api/v1/team/attendance?month=YYYY-MM`.

### 6. Replace Call Volume + Outcome Breakdown charts
In `TeamProfilePanel` (and the equivalent block in `team/[id]/page.tsx` if kept in
sync), remove the 7-day call-volume bar chart and the outcome donut. Replace with:
- **"Calls vs Conversions — Last 14 Days"**: dual-series chart (total calls per day vs
  converted calls per day) computed client-side from the existing `callLogs` (same
  data source as the old weekly chart, extended to 14 days, two series instead of one).
  No backend change required.
- **Outcome Breakdown** as a horizontal bar list with counts + percentages (replacing
  the conic-gradient donut), using the existing `outcomeBreakdown`/`OUTCOME_COLORS`/
  `OUTCOME_LABELS` data — just a different visual treatment.

## Data Flow Summary

```
Team page load
  → api.team.list() + api.callers.list()        (existing)
  → on select member → api.callers.statusSummary/getTimeline/logs (existing, for KPIs/charts/timeline)
  → api.team.attendanceForCaller(callerId)        (new) → AttendanceHeatmap + Mark Attendance

Performance page load
  → api.team.attendanceGrid(month)                (new) → KPI cards + team grid

Mark Attendance (either page)
  → api.team.markAttendance(callerId, date, status) (new, owner-only)
  → refetch attendanceForCaller / attendanceGrid for affected caller
```

## Out of Scope
- No "break" status anywhere in attendance (collapsed to present/absent/future).
- No changes to `caller_status_logs` writers (login/break/logout flow untouched).
- `team/[id]/page.tsx` — apply the same chart/attendance changes only if it remains a
  live route; otherwise leave as-is (verify usage during implementation).
