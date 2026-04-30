# Team Management + Roles + Telecaller View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin invite telecallers by email, manage their team, and give telecallers a role-filtered dashboard view that shows only what they need.

**Architecture:** A new `team.py` route handles invite (calls Supabase Admin invite API → creates `tenant_users` record + `callers` profile in one shot), list, and remove. The frontend sidebar fetches the current user's role from `GET /api/v1/team/me` on mount and conditionally renders only the nav items appropriate for that role. A dedicated Team page lets the owner manage members.

**Tech Stack:** FastAPI, Supabase Auth Admin API (httpx), Next.js 14 App Router, Supabase (existing).

---

## Context (read before starting)

- `tenant_users` table: `tenant_id`, `user_id`, `role` (`owner` | `caller`)
- `callers` table: `id`, `name`, `phone`, `overall_score`, `active`, `tenant_id` — no `user_id` yet
- `backend/app/dependencies/tenant.py` exports `get_tenant_id` and `get_tenant_and_role`
- `backend/app/config.py` has `settings.supabase_url` and `settings.supabase_service_key`
- Supabase Admin invite endpoint: `POST {SUPABASE_URL}/auth/v1/admin/invite` with service key header
- Frontend sidebar is at `frontend/components/sidebar.tsx` — already `"use client"`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/supabase/migrations/020_callers_user_id.sql` | Create | Add `user_id` column to `callers` table |
| `backend/app/routes/team.py` | Create | Invite, list, remove, me endpoints |
| `backend/app/main.py` | Modify | Register team router |
| `frontend/lib/api.ts` | Modify | Add `team` API methods |
| `frontend/components/sidebar.tsx` | Modify | Fetch role on mount, show role-filtered nav |
| `frontend/app/dashboard/team/page.tsx` | Create | Team management UI |

---

## Task 1: DB Migration — add user_id to callers

**Files:**
- Create: `backend/supabase/migrations/020_callers_user_id.sql`

- [ ] **Step 1: Create the migration file**

Create `backend/supabase/migrations/020_callers_user_id.sql`:

```sql
ALTER TABLE callers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS callers_user_id_idx ON callers (user_id) WHERE user_id IS NOT NULL;
COMMENT ON COLUMN callers.user_id IS 'Links telecaller profile to a Supabase auth user. NULL for callers without dashboard access.';
```

- [ ] **Step 2: Apply via Supabase MCP**

Run via `execute_sql` on project `tovmebyyjhvszwgvyfdm`:

```sql
ALTER TABLE callers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS callers_user_id_idx ON callers (user_id) WHERE user_id IS NOT NULL;
```

- [ ] **Step 3: Verify**

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'callers' AND column_name = 'user_id';
```

Expected: one row with `data_type = uuid`.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/020_callers_user_id.sql
git commit -m "feat(db): add user_id to callers table"
```

---

## Task 2: Backend — team routes

**Files:**
- Create: `backend/app/routes/team.py`

- [ ] **Step 1: Create team.py**

Create `backend/app/routes/team.py`:

```python
import logging
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.config import settings
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_and_role, get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


class InvitePayload(BaseModel):
    email: EmailStr
    name: str | None = None
    phone: str | None = None


@router.get("/me")
def get_me(ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    caller = (
        db.table("callers")
        .select("id, name, phone, overall_score")
        .eq("user_id", ctx["user_id"] if "user_id" in ctx else "")
        .maybe_single()
        .execute()
    )
    return {
        "tenant_id": ctx["tenant_id"],
        "role": ctx["role"],
        "caller_profile": caller.data,
    }


@router.get("/")
def list_team(ctx: dict = Depends(get_tenant_and_role)):
    if ctx["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can view team")
    db = get_supabase()
    members = (
        db.table("tenant_users")
        .select("user_id, role, created_at")
        .eq("tenant_id", ctx["tenant_id"])
        .execute()
    )
    user_ids = [m["user_id"] for m in (members.data or [])]
    callers = {}
    if user_ids:
        caller_rows = (
            db.table("callers")
            .select("user_id, id, name, phone, overall_score, active")
            .in_("user_id", user_ids)
            .eq("tenant_id", ctx["tenant_id"])
            .execute()
        )
        callers = {r["user_id"]: r for r in (caller_rows.data or [])}
    result = []
    for m in (members.data or []):
        result.append({
            **m,
            "caller_profile": callers.get(m["user_id"]),
        })
    return {"data": result}


@router.post("/invite")
async def invite_member(payload: InvitePayload, ctx: dict = Depends(get_tenant_and_role)):
    if ctx["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can invite members")

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{settings.supabase_url}/auth/v1/admin/invite",
            headers={
                "apikey": settings.supabase_service_key,
                "Authorization": f"Bearer {settings.supabase_service_key}",
                "Content-Type": "application/json",
            },
            json={"email": payload.email},
        )
        if resp.status_code not in (200, 201):
            detail = resp.json().get("msg", resp.text)
            raise HTTPException(status_code=400, detail=f"Invite failed: {detail}")
        invited_user = resp.json()

    invited_user_id = invited_user["id"]
    db = get_supabase()

    existing = (
        db.table("tenant_users")
        .select("id")
        .eq("user_id", invited_user_id)
        .eq("tenant_id", ctx["tenant_id"])
        .maybe_single()
        .execute()
    )
    if not existing.data:
        db.table("tenant_users").insert({
            "tenant_id": ctx["tenant_id"],
            "user_id": invited_user_id,
            "role": "caller",
        }).execute()

    caller_existing = (
        db.table("callers")
        .select("id")
        .eq("user_id", invited_user_id)
        .eq("tenant_id", ctx["tenant_id"])
        .maybe_single()
        .execute()
    )
    if not caller_existing.data:
        db.table("callers").insert({
            "tenant_id": ctx["tenant_id"],
            "user_id": invited_user_id,
            "name": payload.name or payload.email.split("@")[0],
            "phone": payload.phone,
            "active": True,
        }).execute()

    logger.info(f"Invited {payload.email} to tenant {ctx['tenant_id']}")
    return {"invited": True, "email": payload.email, "user_id": invited_user_id}


@router.delete("/{user_id}")
def remove_member(user_id: str, ctx: dict = Depends(get_tenant_and_role)):
    if ctx["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only owners can remove members")
    db = get_supabase()
    db.table("tenant_users").delete().eq("user_id", user_id).eq("tenant_id", ctx["tenant_id"]).execute()
    db.table("callers").update({"active": False}).eq("user_id", user_id).eq("tenant_id", ctx["tenant_id"]).execute()
    return {"removed": True}
```

- [ ] **Step 2: Verify get_tenant_and_role returns user_id**

The current `get_tenant_and_role` in `backend/app/dependencies/tenant.py` returns `{"tenant_id": ..., "role": ...}` but NOT `user_id`. The `get_me` endpoint needs it. Update `get_tenant_and_role` to also return `user_id`:

Find `get_tenant_and_role` in `backend/app/dependencies/tenant.py` and update the return:

```python
def get_tenant_and_role(user: dict = Depends(get_current_user)) -> dict:
    db = get_supabase()
    result = (
        db.table("tenant_users")
        .select("tenant_id, role")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant associated with this account.",
        )
    return {
        "tenant_id": result.data["tenant_id"],
        "role": result.data["role"],
        "user_id": user["user_id"],
    }
```

- [ ] **Step 3: Register team router in main.py**

In `backend/app/main.py`, add to the imports line:

```python
from app.routes import webhook, leads, messages, analytics, upload, segments, calls, callers, ai_tune, knowledge, system, follow_ups, numbers, incidents, lead_notes, voice_numbers, app_settings, templates, onboarding, team
```

Add to the router registrations:

```python
app.include_router(team.router, prefix="/api/v1/team", tags=["team"], dependencies=_auth)
```

- [ ] **Step 4: Verify endpoints start**

Start the backend and check the docs:

```bash
cd backend && uvicorn app.main:app --reload
```

Visit `http://localhost:8000/docs` — confirm `/api/v1/team/me`, `/api/v1/team/`, `/api/v1/team/invite`, `/api/v1/team/{user_id}` all appear.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/team.py backend/app/dependencies/tenant.py backend/app/main.py
git commit -m "feat(team): invite, list, remove endpoints + get_me"
```

---

## Task 3: Frontend — team API methods

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add team types**

In `frontend/lib/api.ts`, add these interfaces after the existing ones:

```typescript
export interface TeamMember {
  user_id: string;
  role: "owner" | "caller";
  created_at: string;
  caller_profile: {
    id: string;
    name: string | null;
    phone: string | null;
    overall_score: number | null;
    active: boolean;
  } | null;
}

export interface MyProfile {
  tenant_id: string;
  role: "owner" | "caller";
  caller_profile: {
    id: string;
    name: string | null;
    phone: string | null;
    overall_score: number | null;
  } | null;
}
```

- [ ] **Step 2: Add team methods to api object**

In the `api` export object, add after `onboarding`:

```typescript
team: {
  me: () => apiFetch<MyProfile>("/api/v1/team/me"),
  list: () => apiFetch<{ data: TeamMember[] }>("/api/v1/team/"),
  invite: (email: string, name?: string, phone?: string) =>
    apiFetch<{ invited: boolean; email: string; user_id: string }>("/api/v1/team/invite", {
      method: "POST",
      body: JSON.stringify({ email, name, phone }),
    }),
  remove: (userId: string) =>
    apiFetch<{ removed: boolean }>(`/api/v1/team/${userId}`, { method: "DELETE" }),
},
```

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(team): add team API methods to frontend client"
```

---

## Task 4: Frontend — role-aware sidebar

**Files:**
- Modify: `frontend/components/sidebar.tsx`

**Context:** The sidebar is already `"use client"`. It renders a static NAV array. We need to fetch the user's role from `api.team.me()` and filter which nav items are shown.

- [ ] **Step 1: Add role fetch to sidebar**

In `frontend/components/sidebar.tsx`, add `useEffect` and `useState` for role fetching. Add these imports at the top:

```tsx
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
```

Inside the `Sidebar` component, before the return, add:

```tsx
const [role, setRole] = useState<"owner" | "caller" | null>(null);

useEffect(() => {
  api.team.me().then((me) => setRole(me.role)).catch(() => setRole("owner"));
}, []);
```

- [ ] **Step 2: Define role-filtered nav**

Replace the single `NAV` array with two arrays — one for owners, one for callers:

```tsx
const OWNER_NAV = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations" },
  { href: "/dashboard/leads", icon: Users, label: "Leads" },
  { href: "/dashboard/upload", icon: Upload, label: "Upload" },
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes" },
  { href: "/dashboard/knowledge", icon: BookOpen, label: "Knowledge" },
  { href: "/dashboard/ai-tune", icon: Sparkles, label: "AI Tune" },
  { href: "/dashboard/numbers", icon: Layers, label: "Numbers" },
  { href: "/dashboard/templates", icon: FileCheck, label: "Templates" },
  { href: "/dashboard/incidents", icon: AlertTriangle, label: "Incidents" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
];

const CALLER_NAV = [
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations" },
];
```

Note: `Users` is already imported for the Leads item. Add `import { ..., Users as UsersIcon } from "lucide-react"` and use `UsersIcon` for Team to avoid the name collision, OR rename consistently.

- [ ] **Step 3: Use filtered nav in render**

In the sidebar render, replace the hardcoded `NAV` reference with a computed value:

```tsx
const activeNav = role === "caller" ? CALLER_NAV : OWNER_NAV;
```

Then use `activeNav` instead of `NAV` in the `.map()` calls.

- [ ] **Step 4: Test role filtering**

1. Log in as the admin account — confirm all 13 nav items are visible
2. Create a test caller account (Supabase dashboard → Add user, then insert `tenant_users` with role=`caller`)
3. Log in as that caller — confirm only Telecalling, Notes, Conversations are visible

- [ ] **Step 5: Commit**

```bash
git add frontend/components/sidebar.tsx
git commit -m "feat(team): role-based sidebar nav for callers vs owners"
```

---

## Task 5: Frontend — Team management page

**Files:**
- Create: `frontend/app/dashboard/team/page.tsx`

- [ ] **Step 1: Create the Team page**

Create `frontend/app/dashboard/team/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Mail, Trash2, UserPlus, Phone } from "lucide-react";
import { api, TeamMember } from "@/lib/api";

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await api.team.list();
      setMembers(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    setError(null);
    try {
      await api.team.invite(email.trim(), name.trim() || undefined, phone.trim() || undefined);
      setEmail(""); setName(""); setPhone("");
      setShowInvite(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite failed");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!confirm("Remove this member from your team?")) return;
    await api.team.remove(userId);
    await load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="page-subtitle">Invite and manage telecallers under your account.</p>
        </div>
        <button onClick={() => setShowInvite(true)} className="btn-primary">
          <UserPlus size={14} /> Invite Telecaller
        </button>
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-card-hover w-full max-w-md p-6">
            <h2 className="font-display font-bold text-ink mb-4" style={{ fontSize: "1.05rem" }}>
              Invite Telecaller
            </h2>
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 font-body text-sm">{error}</div>
            )}
            <form onSubmit={handleInvite} className="space-y-3">
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input"
                  placeholder="telecaller@example.com"
                />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="Ravi Kumar"
                />
              </div>
              <div>
                <label className="font-body text-sm font-medium text-ink mb-1.5 block">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                  placeholder="+919876543210"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowInvite(false); setError(null); }} className="btn-ghost flex-1">
                  Cancel
                </button>
                <button type="submit" disabled={inviting || !email.trim()} className="btn-primary flex-1">
                  {inviting ? "Sending…" : "Send Invite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card rounded-3xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center font-body text-sm text-ink-muted">Loading…</div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-display font-bold text-ink mb-2">No team members yet</p>
            <p className="font-body text-sm text-ink-muted">Invite your first telecaller to get started.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-subtle">
                {["Member", "Role", "Calls Score", "Phone", ""].map((h) => (
                  <th key={h} className="px-5 py-3 text-left stat-label">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {members.map((m) => (
                <tr key={m.user_id} className="hover:bg-surface-subtle transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-label font-semibold text-ink text-sm">
                      {m.caller_profile?.name || "—"}
                    </p>
                    <p className="font-body text-xs text-ink-muted">{m.user_id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`badge ${m.role === "owner" ? "badge-green" : "badge-yellow"}`}>
                      {m.role}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-body text-sm text-ink">
                      {m.caller_profile?.overall_score ?? "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-body text-sm text-ink-muted flex items-center gap-1">
                      {m.caller_profile?.phone ? (
                        <><Phone size={12} />{m.caller_profile.phone}</>
                      ) : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    {m.role !== "owner" && (
                      <button
                        onClick={() => handleRemove(m.user_id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-ink-muted hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify page loads**

Start the frontend (`npm run dev`). Log in as admin. Visit `http://localhost:3000/dashboard/team`. Confirm the page renders with the member table and an "Invite Telecaller" button.

- [ ] **Step 3: Test invite flow end-to-end**

1. Click "Invite Telecaller"
2. Enter a real email address you control + a name + phone
3. Click "Send Invite"
4. Check that email — Supabase sends a magic link
5. In Supabase dashboard → Authentication → Users — confirm the new user appears
6. Confirm the member appears in the team list after invite

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/team/
git commit -m "feat(team): team management page with invite and remove"
```

---

## Self-Review

**Spec coverage:**
- `user_id` on callers ✅ Task 1
- Invite endpoint (Supabase admin invite → tenant_users → callers) ✅ Task 2
- List team members ✅ Task 2
- Remove member ✅ Task 2
- `GET /team/me` for role check ✅ Task 2
- Team API methods in frontend ✅ Task 3
- Role-filtered sidebar (caller sees 3 items, owner sees all) ✅ Task 4
- Team management page (invite form, member table, remove) ✅ Task 5

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:**
- `MyProfile.role` is `"owner" | "caller"` — matches `TeamMember.role` — matches backend `tenant_users.role` CHECK constraint
- `api.team.me()` returns `MyProfile` — used in sidebar `setRole(me.role)` — consistent
- `api.team.list()` returns `{ data: TeamMember[] }` — matches backend `return {"data": result}` — consistent
- `get_tenant_and_role` now returns `user_id` — used in `get_me` as `ctx["user_id"]` — consistent

**Known gap (Plan 3):** Telecaller assigned-only lead view is Plan 3. Right now callers see all tenant leads in Telecalling. The sidebar filters the menu but doesn't restrict data yet.
