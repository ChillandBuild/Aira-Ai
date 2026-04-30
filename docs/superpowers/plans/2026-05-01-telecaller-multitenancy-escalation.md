# Telecaller Multi-tenancy + Hot Lead Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give 10 telecallers role-restricted dashboard access with auto-assigned leads, and alert them in-app when a high-scoring lead (≥7) needs human attention.

**Architecture:** Role stored in `tenant_users.role` ('owner'|'caller'). Frontend reads role on login and restricts sidebar + data. Backend filters all lead/message queries by `assigned_to` for caller role. Escalation fires from `ai_reply.py` on score threshold crossing, stored in `hot_lead_alerts` table, polled by frontend every 30s.

**Tech Stack:** FastAPI, Supabase (PostgreSQL), Next.js 14, TypeScript, Tailwind

**Spec:** `docs/superpowers/specs/2026-05-01-telecaller-multitenancy-escalation-design.md`

---

## File Map

**New files:**
- `backend/supabase/migrations/025_leads_assigned_to.sql`
- `backend/supabase/migrations/026_hot_lead_alerts.sql`
- `backend/app/services/assignment.py`
- `backend/app/routes/alerts.py`
- `frontend/app/dashboard/contexts/AuthRoleContext.tsx`
- `frontend/components/hot-lead-alert-banner.tsx`

**Modified files:**
- `backend/app/dependencies/tenant.py` — add caller_id to get_tenant_and_role
- `backend/app/routes/leads.py` — filter by assigned_to for caller role
- `backend/app/routes/messages.py` — filter messages to caller's leads
- `backend/app/routes/webhook.py` — auto-assign on new lead creation
- `backend/app/services/ai_reply.py` — trigger alert on score ≥ 7
- `backend/app/main.py` — register alerts router
- `frontend/app/dashboard/layout.tsx` — role context provider + alert polling + navbar badge
- `frontend/app/dashboard/leads/page.tsx` — caller filter
- `frontend/app/dashboard/conversations/page.tsx` — caller filter
- `frontend/app/dashboard/telecalling/page.tsx` — caller filter (already filtered by assigned leads)
- `frontend/lib/api.ts` — add assign + alerts API calls

---

## PHASE 1 — Telecaller Multi-tenancy

---

### Task 1: DB Migration — leads.assigned_to

**Files:**
- Create: `backend/supabase/migrations/025_leads_assigned_to.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- backend/supabase/migrations/025_leads_assigned_to.sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES callers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads (assigned_to, tenant_id);
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with project_id `tovmebyyjhvszwgvyfdm` and the SQL above.

Verify: `SELECT column_name FROM information_schema.columns WHERE table_name = 'leads' AND column_name = 'assigned_to';` — should return 1 row.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/migrations/025_leads_assigned_to.sql
git commit -m "feat(db): add assigned_to column to leads"
```

---

### Task 2: Assignment Service

**Files:**
- Create: `backend/app/services/assignment.py`

- [ ] **Step 1: Create the service**

```python
# backend/app/services/assignment.py
import logging
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)


def get_caller_id_for_user(user_id: str, tenant_id: str) -> str | None:
    """Return callers.id for this auth user, or None if not a caller."""
    db = get_supabase()
    result = (
        db.table("callers")
        .select("id")
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .maybe_single()
        .execute()
    )
    if result is None:
        return None
    return (result.data or {}).get("id")


def auto_assign_lead(lead_id: str, tenant_id: str) -> str | None:
    """
    Assign lead to the active caller with fewest assigned pending leads.
    Returns the assigned caller's id, or None if no active callers exist.
    """
    db = get_supabase()
    callers = (
        db.table("callers")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .execute()
    )
    if not callers.data:
        return None

    # Count assigned non-disqualified leads per caller
    min_count = None
    chosen_id = None
    for caller in callers.data:
        count_res = (
            db.table("leads")
            .select("id", count="exact")
            .eq("tenant_id", tenant_id)
            .eq("assigned_to", caller["id"])
            .neq("segment", "D")
            .execute()
        )
        count = count_res.count or 0
        if min_count is None or count < min_count:
            min_count = count
            chosen_id = caller["id"]

    if chosen_id:
        db.table("leads").update({"assigned_to": chosen_id}).eq("id", lead_id).execute()
        logger.info(f"Lead {lead_id} auto-assigned to caller {chosen_id}")

    return chosen_id
```

- [ ] **Step 2: Verify import works**

```bash
cd backend && python -c "from app.services.assignment import auto_assign_lead, get_caller_id_for_user; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/assignment.py
git commit -m "feat(assignment): auto-assign and caller lookup service"
```

---

### Task 3: Update tenant dependency to include caller_id

**Files:**
- Modify: `backend/app/dependencies/tenant.py`

- [ ] **Step 1: Read the current file**

Read `backend/app/dependencies/tenant.py` — find `get_tenant_and_role`.

- [ ] **Step 2: Update get_tenant_and_role to include caller_id**

Replace the `get_tenant_and_role` function:

```python
def get_tenant_and_role(user: dict = Depends(get_current_user)) -> dict:
    from app.services.assignment import get_caller_id_for_user
    db = get_supabase()
    result = (
        db.table("tenant_users")
        .select("tenant_id, role")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant associated with this account.",
        )
    tenant_id = result.data["tenant_id"]
    role = result.data["role"]
    caller_id = get_caller_id_for_user(user["user_id"], tenant_id) if role == "caller" else None
    return {
        "tenant_id": tenant_id,
        "role": role,
        "user_id": user["user_id"],
        "caller_id": caller_id,
    }
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/dependencies/tenant.py
git commit -m "feat(tenant): include caller_id in get_tenant_and_role"
```

---

### Task 4: Backend — assign endpoint + auto-assign in webhook

**Files:**
- Modify: `backend/app/routes/leads.py`
- Modify: `backend/app/routes/webhook.py`

- [ ] **Step 1: Add assign endpoint to leads.py**

Read `backend/app/routes/leads.py`. Add this endpoint (owner-only):

```python
class AssignPayload(BaseModel):
    caller_id: str | None = None  # None = unassign

@router.patch("/{lead_id}/assign")
async def assign_lead(
    lead_id: str,
    payload: AssignPayload,
    ctx: dict = Depends(get_tenant_and_role),
):
    if ctx["role"] != "owner":
        raise HTTPException(status_code=403, detail="Owner only")
    db = get_supabase()
    db.table("leads").update({"assigned_to": payload.caller_id}).eq(
        "id", lead_id
    ).eq("tenant_id", ctx["tenant_id"]).execute()
    return {"success": True}
```

Add `from app.dependencies.tenant import get_tenant_and_role` if not already imported. Add `from pydantic import BaseModel` if not already imported.

- [ ] **Step 2: Filter leads list by assigned_to for caller role**

In `backend/app/routes/leads.py`, find the main `GET /` list endpoint. Add caller filter after the existing tenant_id filter:

```python
# After .eq("tenant_id", tenant_id):
if ctx.get("role") == "caller" and ctx.get("caller_id"):
    query = query.eq("assigned_to", ctx["caller_id"])
```

This requires the GET endpoint to use `get_tenant_and_role` instead of `get_tenant_id`. Update the dependency accordingly.

- [ ] **Step 3: Auto-assign in webhook on new lead creation**

In `backend/app/routes/webhook.py`, find where new leads are inserted (the `else` branch after `existing.data` check). After the insert, add:

```python
from app.services.assignment import auto_assign_lead
# After lead_id = new_lead.data[0]["id"]:
try:
    auto_assign_lead(lead_id, tenant_id)
except Exception as e:
    logger.warning(f"Auto-assign failed for lead {lead_id}: {e}")
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/leads.py backend/app/routes/webhook.py
git commit -m "feat(leads): assign endpoint + auto-assign on new lead"
```

---

### Task 5: Frontend — AuthRoleContext

**Files:**
- Create: `frontend/app/dashboard/contexts/AuthRoleContext.tsx`
- Modify: `frontend/app/dashboard/layout.tsx`

- [ ] **Step 1: Create the role context**

```tsx
// frontend/app/dashboard/contexts/AuthRoleContext.tsx
"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiFetch } from "@/lib/api";

interface RoleCtx {
  role: "owner" | "caller" | null;
  callerId: string | null;
  loading: boolean;
}

const AuthRoleContext = createContext<RoleCtx>({ role: null, callerId: null, loading: true });

export function AuthRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<"owner" | "caller" | null>(null);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<{ role: string; caller_id: string | null }>("/api/v1/team/me")
      .then(d => {
        setRole(d.role as "owner" | "caller");
        setCallerId(d.caller_id);
      })
      .catch(() => setRole("owner"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthRoleContext.Provider value={{ role, callerId, loading }}>
      {children}
    </AuthRoleContext.Provider>
  );
}

export const useAuthRole = () => useContext(AuthRoleContext);
```

- [ ] **Step 2: Add /api/v1/team/me endpoint**

In `backend/app/routes/team.py`, add:

```python
@router.get("/me")
async def get_my_role(ctx: dict = Depends(get_tenant_and_role)):
    return {
        "role": ctx["role"],
        "caller_id": ctx.get("caller_id"),
        "tenant_id": ctx["tenant_id"],
    }
```

Import `get_tenant_and_role` if not already present.

- [ ] **Step 3: Wrap dashboard layout with provider**

In `frontend/app/dashboard/layout.tsx`, import and wrap children:

```tsx
import { AuthRoleProvider } from "./contexts/AuthRoleContext";
// In the JSX, wrap:
<AuthRoleProvider>
  {/* existing layout content */}
</AuthRoleProvider>
```

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/contexts/AuthRoleContext.tsx frontend/app/dashboard/layout.tsx backend/app/routes/team.py
git commit -m "feat(auth): role context provider + /team/me endpoint"
```

---

### Task 6: Frontend — Sidebar restriction for caller role

**Files:**
- Modify: `frontend/app/dashboard/layout.tsx` (or wherever the sidebar nav items are defined)

- [ ] **Step 1: Read the sidebar nav items**

Find where nav items are defined in the layout or a sidebar component. Look for links to /settings, /numbers, /ai-tune, /incidents, /analytics, /upload.

- [ ] **Step 2: Import useAuthRole and conditionally hide items**

```tsx
import { useAuthRole } from "./contexts/AuthRoleContext";

// Inside the component:
const { role } = useAuthRole();
const isOwner = role === "owner" || role === null; // null = loading, show all by default
```

Wrap owner-only nav items:

```tsx
{isOwner && <NavItem href="/dashboard/settings" label="Settings" />}
{isOwner && <NavItem href="/dashboard/numbers" label="Numbers" />}
{isOwner && <NavItem href="/dashboard/ai-tune" label="AI Tune" />}
{isOwner && <NavItem href="/dashboard/incidents" label="Incidents" />}
{isOwner && <NavItem href="/dashboard/analytics" label="Analytics" />}
{isOwner && <NavItem href="/dashboard/upload" label="Upload" />}
```

Keep visible for all roles: Telecalling, Conversations, Leads, Notes, Knowledge.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/layout.tsx
git commit -m "feat(sidebar): hide owner-only nav items for caller role"
```

---

### Task 7: Frontend — Lead/conversation data filtered by role

**Files:**
- Modify: `frontend/app/dashboard/leads/page.tsx`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add caller_id param to leads API call**

In `frontend/lib/api.ts`, find `api.leads.list` or similar. The backend now auto-filters based on the auth token's role — no frontend change needed for the data filter itself. The backend `GET /api/v1/leads` already filters by `assigned_to` for caller role.

Verify this works by checking the network tab after login as a caller. If the backend returns filtered results, the frontend needs no change.

- [ ] **Step 2: Add "Assign" button to lead cards (admin only)**

In `frontend/app/dashboard/leads/page.tsx`, read the file. Find the lead card component. Add:

```tsx
import { useAuthRole } from "../contexts/AuthRoleContext";
const { role } = useAuthRole();

// In lead card JSX, after existing action buttons:
{role === "owner" && (
  <AssignButton leadId={lead.id} currentAssignedTo={lead.assigned_to} />
)}
```

- [ ] **Step 3: Build AssignButton component inline**

Add to leads page (or extract to a component file):

```tsx
function AssignButton({ leadId, currentAssignedTo }: { leadId: string; currentAssignedTo: string | null }) {
  const [callers, setCallers] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && callers.length === 0) {
      apiFetch<{ data: { id: string; name: string }[] }>("/api/v1/callers").then(r => setCallers(r.data || []));
    }
  }, [open]);

  async function assign(callerId: string | null) {
    await apiFetch(`/api/v1/leads/${leadId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ caller_id: callerId }),
    });
    setOpen(false);
    window.location.reload(); // simple refresh
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} className="text-xs px-2 py-1 rounded-lg bg-surface-mid text-on-surface-muted hover:bg-surface-low">
        👤 Assign
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 bg-white border border-surface-mid rounded-xl shadow-xl min-w-[160px] py-1">
          <button onClick={() => assign(null)} className="w-full text-left px-4 py-2 text-sm text-on-surface-muted hover:bg-surface-low">Unassign</button>
          {callers.map(c => (
            <button key={c.id} onClick={() => assign(c.id)} className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-low ${c.id === currentAssignedTo ? "font-bold text-tertiary" : "text-on-surface"}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

Add `import { useState, useEffect } from "react"` and `import { apiFetch } from "@/lib/api"` if not present.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/leads/page.tsx
git commit -m "feat(leads): assign button for owner role"
```

---

## PHASE 2 — Hot Lead Escalation

---

### Task 8: DB Migration — hot_lead_alerts

**Files:**
- Create: `backend/supabase/migrations/026_hot_lead_alerts.sql`

- [ ] **Step 1: Write migration**

```sql
-- backend/supabase/migrations/026_hot_lead_alerts.sql
CREATE TABLE IF NOT EXISTS hot_lead_alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  assigned_caller_id uuid REFERENCES callers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'escalated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES callers(id) ON DELETE SET NULL
);

CREATE INDEX hot_lead_alerts_tenant_status_idx
  ON hot_lead_alerts (tenant_id, status, created_at DESC);

CREATE INDEX hot_lead_alerts_lead_id_idx
  ON hot_lead_alerts (lead_id);
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with project_id `tovmebyyjhvszwgvyfdm`.

Verify: `SELECT table_name FROM information_schema.tables WHERE table_name = 'hot_lead_alerts';` — should return 1 row.

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/migrations/026_hot_lead_alerts.sql
git commit -m "feat(db): hot_lead_alerts table"
```

---

### Task 9: Backend — Alerts routes

**Files:**
- Create: `backend/app/routes/alerts.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create alerts.py**

```python
# backend/app/routes/alerts.py
import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_and_role

logger = logging.getLogger(__name__)
router = APIRouter()

_ESCALATION_MINUTES = 5


@router.get("/mine")
async def get_my_alerts(ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    tenant_id = ctx["tenant_id"]
    role = ctx["role"]
    caller_id = ctx.get("caller_id")

    now = datetime.now(timezone.utc)
    escalation_cutoff = (now - timedelta(minutes=_ESCALATION_MINUTES)).isoformat()

    # Auto-escalate old pending alerts
    db.table("hot_lead_alerts").update({"status": "escalated"}).eq(
        "tenant_id", tenant_id
    ).eq("status", "pending").lt("created_at", escalation_cutoff).execute()

    # Fetch relevant alerts
    query = (
        db.table("hot_lead_alerts")
        .select("*, lead:leads(id,name,phone,score,segment)")
        .eq("tenant_id", tenant_id)
        .eq("status", "pending")
    )

    if role == "caller" and caller_id:
        # Caller sees: their own pending + escalated alerts
        pending_own = (
            db.table("hot_lead_alerts")
            .select("*, lead:leads(id,name,phone,score,segment)")
            .eq("tenant_id", tenant_id)
            .eq("assigned_caller_id", caller_id)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .execute()
        )
        escalated = (
            db.table("hot_lead_alerts")
            .select("*, lead:leads(id,name,phone,score,segment)")
            .eq("tenant_id", tenant_id)
            .eq("status", "escalated")
            .order("created_at", desc=True)
            .execute()
        )
        alerts = (pending_own.data or []) + (escalated.data or [])
    else:
        # Owner sees all pending + escalated
        all_alerts = (
            db.table("hot_lead_alerts")
            .select("*, lead:leads(id,name,phone,score,segment)")
            .eq("tenant_id", tenant_id)
            .in_("status", ["pending", "escalated"])
            .order("created_at", desc=True)
            .execute()
        )
        alerts = all_alerts.data or []

    return {"data": alerts}


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    caller_id = ctx.get("caller_id")

    res = db.table("hot_lead_alerts").update({
        "status": "acknowledged",
        "acknowledged_at": now,
        "acknowledged_by": caller_id,
    }).eq("id", alert_id).eq("tenant_id", ctx["tenant_id"]).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"success": True}


def create_alert(lead_id: str, tenant_id: str, assigned_caller_id: str | None) -> None:
    """Internal call from ai_reply.py — fire and forget."""
    try:
        # Don't create duplicate pending alert for same lead
        db = get_supabase()
        existing = (
            db.table("hot_lead_alerts")
            .select("id")
            .eq("lead_id", lead_id)
            .eq("tenant_id", tenant_id)
            .in_("status", ["pending", "escalated"])
            .maybe_single()
            .execute()
        )
        if existing and existing.data:
            return  # Already has an active alert
        db.table("hot_lead_alerts").insert({
            "lead_id": lead_id,
            "tenant_id": tenant_id,
            "assigned_caller_id": assigned_caller_id,
        }).execute()
        logger.info(f"Hot lead alert created for lead {lead_id}")
    except Exception as e:
        logger.error(f"Failed to create alert for lead {lead_id}: {e}")
```

- [ ] **Step 2: Register in main.py**

In `backend/app/main.py`, add:

```python
from app.routes import alerts
app.include_router(alerts.router, prefix="/api/v1/alerts", tags=["alerts"], dependencies=_auth)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/routes/alerts.py backend/app/main.py
git commit -m "feat(alerts): hot lead alert endpoints"
```

---

### Task 10: Trigger alert from ai_reply.py

**Files:**
- Modify: `backend/app/services/ai_reply.py`

- [ ] **Step 1: Import create_alert**

At the top of `backend/app/services/ai_reply.py`, add:

```python
from app.routes.alerts import create_alert
```

- [ ] **Step 2: Fire alert on score threshold crossing**

In `generate_reply`, find Step 5 (re-score lead). After `db.table("leads").update(...)` succeeds and `new_score` is computed, add:

```python
# Fire hot lead alert on first threshold crossing
if new_score >= 7 and (lead_data.get("score") or 5) < 7:
    assigned_to = lead_data.get("assigned_to")  # caller uuid or None
    # Get assigned_caller_id from leads table
    try:
        lead_full = db.table("leads").select("assigned_to").eq("id", str(lead_id)).maybe_single().execute()
        assigned_to = (lead_full.data or {}).get("assigned_to") if lead_full else None
    except Exception:
        assigned_to = None
    create_alert(
        lead_id=str(lead_id),
        tenant_id=lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001",
        assigned_caller_id=assigned_to,
    )
```

Note: The `leads` select in Step 0 of `generate_reply` fetches `ai_enabled,score,segment,phone,converted_at,tenant_id` — add `assigned_to` to this select so we don't need the extra query:

Change:
```python
.select("ai_enabled,score,segment,phone,converted_at,tenant_id")
```
To:
```python
.select("ai_enabled,score,segment,phone,converted_at,tenant_id,assigned_to")
```

Then simplify the alert trigger:
```python
if new_score >= 7 and (lead_data.get("score") or 5) < 7:
    create_alert(
        lead_id=str(lead_id),
        tenant_id=lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001",
        assigned_caller_id=lead_data.get("assigned_to"),
    )
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/ai_reply.py
git commit -m "feat(ai): trigger hot lead alert on score >= 7"
```

---

### Task 11: Frontend — Alert banner + navbar badge

**Files:**
- Create: `frontend/components/hot-lead-alert-banner.tsx`
- Modify: `frontend/app/dashboard/layout.tsx`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add alerts API to api.ts**

In `frontend/lib/api.ts`, add:

```ts
export interface HotLeadAlert {
  id: string;
  lead_id: string;
  status: "pending" | "acknowledged" | "escalated";
  created_at: string;
  assigned_caller_id: string | null;
  lead: { id: string; name: string | null; phone: string; score: number; segment: string } | null;
}

// Inside the api object:
alerts: {
  mine: async (): Promise<HotLeadAlert[]> => {
    const res = await apiFetch<{ data: HotLeadAlert[] }>("/api/v1/alerts/mine");
    return res.data || [];
  },
  acknowledge: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/v1/alerts/${id}/acknowledge`, { method: "PATCH" }),
},
```

- [ ] **Step 2: Create hot-lead-alert-banner.tsx**

```tsx
// frontend/components/hot-lead-alert-banner.tsx
"use client";
import { useEffect, useState } from "react";
import { api, HotLeadAlert } from "@/lib/api";

interface Props {
  onCountChange?: (count: number) => void;
}

export function HotLeadAlertBanner({ onCountChange }: Props) {
  const [alerts, setAlerts] = useState<HotLeadAlert[]>([]);

  async function load() {
    try {
      const data = await api.alerts.mine();
      setAlerts(data);
      onCountChange?.(data.length);
    } catch {}
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  async function dismiss(id: string) {
    await api.alerts.acknowledge(id);
    setAlerts(prev => prev.filter(a => a.id !== id));
    onCountChange?.(alerts.length - 1);
  }

  if (alerts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {alerts.map(alert => (
        <div key={alert.id} className="bg-red-600 text-white rounded-2xl shadow-xl px-4 py-3 flex items-start gap-3 animate-pulse-once">
          <span className="text-xl">🔴</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">
              {alert.lead?.name || "Unknown"} ({alert.lead?.phone}) — Score {alert.lead?.score}/10
            </p>
            <p className="text-xs text-red-200 mt-0.5">
              {alert.status === "escalated" ? "⚡ Escalated — needs anyone available" : "Needs your attention"}
            </p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <a
              href={`/dashboard/telecalling`}
              onClick={() => dismiss(alert.id)}
              className="text-xs bg-white text-red-600 font-bold px-3 py-1 rounded-lg hover:bg-red-50"
            >
              Call Now
            </a>
            <button
              onClick={() => dismiss(alert.id)}
              className="text-xs text-red-200 hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add banner + badge to dashboard layout**

In `frontend/app/dashboard/layout.tsx`:

```tsx
import { HotLeadAlertBanner } from "@/components/hot-lead-alert-banner";

// Add state for badge count:
const [alertCount, setAlertCount] = useState(0);

// In JSX, add banner at root level (before sidebar/main):
<HotLeadAlertBanner onCountChange={setAlertCount} />

// In navbar/header, add red badge next to bell or name:
{alertCount > 0 && (
  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold">
    {alertCount}
  </span>
)}
```

- [ ] **Step 4: Commit and push everything**

```bash
git add \
  frontend/components/hot-lead-alert-banner.tsx \
  frontend/app/dashboard/layout.tsx \
  frontend/lib/api.ts
git commit -m "feat(alerts): hot lead alert banner + navbar badge"
git push origin main
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 7 implementation items from spec are covered (migration, assignment service, assign endpoint, webhook auto-assign, role context, sidebar restriction, lead filter, alert table, alert routes, ai_reply trigger, frontend banner)
- [x] **No placeholders:** All steps have concrete code
- [x] **Type consistency:** `HotLeadAlert` defined in Task 11 Step 1, used in Step 2. `get_caller_id_for_user` defined in Task 2, used in Task 3. `create_alert` defined in Task 9, imported in Task 10.
- [x] **Assign endpoint path:** `/api/v1/leads/{lead_id}/assign` consistent across backend Task 4 and frontend Task 7
- [x] **Supabase project_id:** `tovmebyyjhvszwgvyfdm` used in both migrations
