# Design: Telecaller Multi-tenancy + Hot Lead Escalation

**Date:** 2026-05-01  
**Status:** Approved  
**Scope:** Two independent systems built sequentially. System 1 (multi-tenancy) is prerequisite for System 2 (escalation).

---

## System 1 — Telecaller Multi-tenancy

### Summary
10 telecallers work under one admin. Each telecaller logs in with their own Gmail and sees only their assigned leads. The admin sees everything and controls assignment.

### Roles
- `owner` — full dashboard access, manages team, assigns leads
- `caller` — restricted view: only Telecalling, Conversations (their leads only), Notes

Role is read from `tenant_users.role` on login and stored in frontend session context.

### Lead Assignment
Two modes, both supported:
1. **Manual** — admin clicks "Assign" on any lead card → dropdown of active callers → saves `assigned_to`
2. **Round-robin auto** — when a new lead arrives via WhatsApp webhook, system picks the active caller with the fewest currently assigned pending leads and sets `assigned_to` automatically

### DB Changes (Migration 025)
```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES callers(id);
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads (assigned_to);
```

### Backend Changes
- `GET /api/v1/leads` — if `role = caller`, add filter `.eq("assigned_to", caller_id)`
- `GET /api/v1/messages` — filter by leads the caller owns
- `PATCH /api/v1/leads/{id}/assign` — new endpoint, owner-only, sets `assigned_to`
- `webhook.py` — on new lead creation, call `auto_assign_lead(lead_id, tenant_id)` which picks the least-loaded active caller
- New helper `services/assignment.py` — `auto_assign_lead()` and `get_caller_id_for_user(user_id, tenant_id)`

### Frontend Changes
- `AuthContext` — store `role` and `caller_id` from session
- Sidebar — conditionally hide for `caller` role: Settings, Numbers, AI Tune, Incidents, Analytics, Upload
- Leads page — pass `assigned_to` filter when role is caller
- Conversations page — filter to caller's leads only
- Lead card (admin view) — add "👤 Assign" button with caller dropdown
- Team page — already exists; extend to show each caller's assigned lead count

---

## System 2 — Hot Lead Escalation (In-App)

### Summary
When AI scores a lead ≥ 7 for the first time, a hot lead alert is created. The assigned telecaller sees it immediately. If not acknowledged within 5 minutes, all active callers see it. Admin always sees all unacknowledged alerts.

### Trigger
In `ai_reply.py`, after `score_message()`:
- If `new_score >= 7` AND `old_score < 7` → create alert (threshold crossing only, not every message)
- If lead has no assigned caller → alert goes to admin only

### DB Changes (Migration 026)
```sql
CREATE TABLE hot_lead_alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  assigned_caller_id uuid REFERENCES callers(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'escalated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES callers(id)
);
CREATE INDEX hot_lead_alerts_tenant_status_idx ON hot_lead_alerts (tenant_id, status, created_at DESC);
```

### Backend Changes
- `POST /api/v1/alerts` — internal call from ai_reply.py to create alert
- `GET /api/v1/alerts/mine` — returns alerts for current caller: own pending + escalated (>5 min old) + all if owner
- `PATCH /api/v1/alerts/{id}/acknowledge` — marks alert acknowledged, records who did it
- Escalation logic: in `GET /api/v1/alerts/mine`, if `created_at < now() - 5min` AND `status = pending` → update to `escalated` and return to all callers

### Frontend Changes
- Navbar — red pulsing badge showing unread alert count, polling every 30s
- Alert banner (dismissible, top of page) — "🔴 Ravi (+91XXXXXX) scored 8 — needs attention" with **Call Now** button
- **Call Now** → opens telecalling modal for that lead + marks alert acknowledged
- Admin view — sees all unacknowledged alerts across all callers

---

## Implementation Order
1. Migration 025 (leads.assigned_to)
2. `services/assignment.py` helper
3. Backend: assign endpoint + webhook auto-assign
4. Frontend: role context + sidebar restriction + assign UI
5. Migration 026 (hot_lead_alerts)
6. Backend: alerts endpoints
7. Frontend: navbar badge + alert banner + Call Now flow

---

## What This Does NOT Include (deferred)
- WhatsApp notification to telecaller's phone (future)
- Callback reminder via WhatsApp (future)
- Per-caller performance analytics (future)
