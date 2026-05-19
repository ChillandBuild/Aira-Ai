# Feature Flags + Operator Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate dashboard modules per tenant using `enabled_features`, and give the system admin (Prem) an `/operator` console to provision clients with the right service tier.

**Architecture:** Add `enabled_features text[]` to the `tenants` table and a `system_admins` table. The `team/me` endpoint returns these to the frontend. `AuthRoleContext` stores them. The sidebar filters nav items by feature. A separate `/operator` route (outside the dashboard) lets the system admin create and manage tenants.

**Tech Stack:** FastAPI + Supabase Python SDK (backend), Next.js 14 App Router + TypeScript (frontend), Supabase MCP for migrations.

---

## File Map

| Action | File |
|---|---|
| Create | `backend/supabase/migrations/041_tenant_features.sql` |
| Create | `backend/supabase/migrations/042_system_admins.sql` |
| Create | `backend/app/dependencies/system_admin.py` |
| Create | `backend/app/routes/operator.py` |
| Modify | `backend/app/routes/team.py` — `get_me` returns `enabled_features` + `is_system_admin` |
| Modify | `backend/app/main.py` — register operator router |
| Modify | `frontend/app/dashboard/contexts/AuthRoleContext.tsx` — add `enabledFeatures`, `isSystemAdmin` |
| Modify | `frontend/components/sidebar.tsx` — filter nav by `enabledFeatures`, add operator link |
| Create | `frontend/app/operator/layout.tsx` |
| Create | `frontend/app/operator/page.tsx` |

---

## Task 1: DB Migration — tenant features + system admins

**Files:**
- Create: `backend/supabase/migrations/041_tenant_features.sql`
- Create: `backend/supabase/migrations/042_system_admins.sql`

- [ ] **Step 1: Write migration 041**

```sql
-- backend/supabase/migrations/041_tenant_features.sql
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS enabled_features text[] DEFAULT ARRAY['whatsapp', 'telecalling'],
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Backfill existing tenants with full access
UPDATE tenants SET enabled_features = ARRAY['whatsapp', 'telecalling'] WHERE enabled_features IS NULL;
UPDATE tenants SET status = 'active' WHERE status IS NULL;
```

- [ ] **Step 2: Write migration 042**

```sql
-- backend/supabase/migrations/042_system_admins.sql
CREATE TABLE IF NOT EXISTS system_admins (
  user_id uuid PRIMARY KEY,
  created_at timestamptz DEFAULT now()
);

-- Insert Prem (owner user_id from tenant_users where role='owner')
INSERT INTO system_admins (user_id)
SELECT DISTINCT tu.user_id
FROM tenant_users tu
WHERE tu.tenant_id = '00000000-0000-0000-0000-000000000001'
  AND tu.role = 'owner'
ON CONFLICT DO NOTHING;
```

- [ ] **Step 3: Apply both migrations via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` for each migration file in order.
Project ID: `tovmebyyjhvszwgvyfdm`

- [ ] **Step 4: Verify**

```sql
-- Run via Supabase MCP execute_sql
SELECT id, name, enabled_features, status FROM tenants LIMIT 5;
SELECT user_id FROM system_admins;
```

Expected: `enabled_features = {whatsapp,telecalling}`, `status = active` for existing tenant.
`system_admins` has one row with the owner's user_id.

- [ ] **Step 5: Commit**

```bash
git add backend/supabase/migrations/041_tenant_features.sql backend/supabase/migrations/042_system_admins.sql
git commit -m "feat: add enabled_features + system_admins tables"
```

---

## Task 2: Backend — system_admin dependency + updated team/me

**Files:**
- Create: `backend/app/dependencies/system_admin.py`
- Modify: `backend/app/routes/team.py` lines 20–37 (get_me function)

- [ ] **Step 1: Create system_admin dependency**

Create `backend/app/dependencies/system_admin.py`:

```python
from fastapi import Depends, HTTPException, status
from app.db.supabase import get_supabase
from app.dependencies.auth import get_current_user


def get_system_admin(user: dict = Depends(get_current_user)) -> dict:
    db = get_supabase()
    result = (
        db.table("system_admins")
        .select("user_id")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System admin access required.",
        )
    return user
```

- [ ] **Step 2: Update `get_me` in `backend/app/routes/team.py`**

Replace the existing `get_me` function (lines 20–37) with:

```python
@router.get("/me")
def get_me(ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()

    # Enabled features for this tenant
    tenant = (
        db.table("tenants")
        .select("enabled_features")
        .eq("id", ctx["tenant_id"])
        .maybe_single()
        .execute()
    )
    enabled_features: list[str] = (
        (tenant.data or {}).get("enabled_features") or ["whatsapp", "telecalling"]
    )

    # Check system admin
    admin = (
        db.table("system_admins")
        .select("user_id")
        .eq("user_id", ctx["user_id"])
        .maybe_single()
        .execute()
    )
    is_system_admin = bool(admin.data)

    caller = (
        db.table("callers")
        .select("id, name, phone, overall_score")
        .eq("user_id", ctx["user_id"])
        .eq("tenant_id", ctx["tenant_id"])
        .limit(1)
        .execute()
    )
    profile = caller.data[0] if caller and caller.data else None

    return {
        "tenant_id": ctx["tenant_id"],
        "role": ctx["role"],
        "caller_id": ctx.get("caller_id"),
        "caller_profile": profile,
        "enabled_features": enabled_features,
        "is_system_admin": is_system_admin,
    }
```

- [ ] **Step 3: Smoke test**

Start the backend (`uvicorn app.main:app --reload` in `backend/`) then:

```bash
curl -H "Authorization: Bearer <your-token>" http://localhost:8000/api/v1/team/me
```

Expected response includes:
```json
{
  "enabled_features": ["whatsapp", "telecalling"],
  "is_system_admin": true
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/dependencies/system_admin.py backend/app/routes/team.py
git commit -m "feat: team/me returns enabled_features and is_system_admin"
```

---

## Task 3: Backend — operator routes

**Files:**
- Create: `backend/app/routes/operator.py`

- [ ] **Step 1: Create operator router**

Create `backend/app/routes/operator.py`:

```python
import logging
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from app.db.supabase import get_supabase
from app.dependencies.system_admin import get_system_admin

logger = logging.getLogger(__name__)
router = APIRouter()

ServiceTier = Literal["whatsapp_only", "telecalling_only", "combined"]

_FEATURE_MAP: dict[str, list[str]] = {
    "whatsapp_only": ["whatsapp"],
    "telecalling_only": ["telecalling"],
    "combined": ["whatsapp", "telecalling"],
}


class CreateClientPayload(BaseModel):
    company_name: str
    email: EmailStr
    password: str
    service: ServiceTier = "combined"


class UpdateFeaturesPayload(BaseModel):
    service: ServiceTier


class UpdateStatusPayload(BaseModel):
    status: Literal["active", "suspended"]


@router.get("/clients")
def list_clients(_admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    tenants = db.table("tenants").select("id, name, enabled_features, status, created_at").order("created_at", desc=True).execute()
    rows = tenants.data or []

    # For each tenant, find the owner user_id + email
    result = []
    for t in rows:
        owner = (
            db.table("tenant_users")
            .select("user_id")
            .eq("tenant_id", t["id"])
            .eq("role", "owner")
            .maybe_single()
            .execute()
        )
        owner_user_id = (owner.data or {}).get("user_id")
        result.append({
            **t,
            "owner_user_id": owner_user_id,
        })
    return {"data": result}


@router.post("/clients", status_code=201)
async def create_client(payload: CreateClientPayload, _admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    features = _FEATURE_MAP[payload.service]

    # Create Supabase auth user
    try:
        result = db.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
        })
        user = result.user
        new_user_id = user.id if hasattr(user, "id") else user["id"]
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=400, detail="A user with this email already exists")
        raise HTTPException(status_code=400, detail=f"Failed to create user: {msg}")

    # Create tenant
    tenant_result = db.table("tenants").insert({
        "name": payload.company_name,
        "enabled_features": features,
        "status": "active",
    }).execute()
    tenant_id = tenant_result.data[0]["id"]

    # Seed app_settings for the new tenant (copy keys from migration 034)
    setting_keys = [
        ("meta_phone_number_id", False), ("meta_access_token", True),
        ("meta_waba_id", False), ("meta_webhook_verify_token", True),
        ("telecmi_user_id", False), ("telecmi_secret", True),
        ("telecmi_callerid", False), ("telecmi_recording_base_url", False),
        ("groq_api_key", True), ("gemini_api_key", True),
        ("ai_auto_reply_enabled", False), ("faq_match_threshold", False),
        ("razorpay_key_id", False), ("razorpay_key_secret", True),
        ("razorpay_webhook_secret", True),
    ]
    db.table("app_settings").insert([
        {"tenant_id": tenant_id, "key": k, "value": None, "is_secret": s}
        for k, s in setting_keys
    ]).execute()

    # Link owner
    db.table("tenant_users").insert({
        "tenant_id": tenant_id,
        "user_id": new_user_id,
        "role": "owner",
    }).execute()

    # Create owner caller record (needed for TeleCMI agent ID on Team page)
    db.table("callers").insert({
        "tenant_id": tenant_id,
        "user_id": new_user_id,
        "name": "Admin",
        "active": True,
        "overall_score": 7.0,
    }).execute()

    logger.info(f"Operator created client: {payload.company_name} ({tenant_id}), service={payload.service}")
    return {
        "tenant_id": tenant_id,
        "company_name": payload.company_name,
        "email": payload.email,
        "service": payload.service,
        "enabled_features": features,
    }


@router.patch("/clients/{tenant_id}/features")
def update_features(tenant_id: str, payload: UpdateFeaturesPayload, _admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    features = _FEATURE_MAP[payload.service]
    result = db.table("tenants").update({"enabled_features": features}).eq("id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"tenant_id": tenant_id, "enabled_features": features}


@router.patch("/clients/{tenant_id}/status")
def update_status(tenant_id: str, payload: UpdateStatusPayload, _admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    result = db.table("tenants").update({"status": payload.status}).eq("id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"tenant_id": tenant_id, "status": payload.status}


@router.post("/clients/{tenant_id}/reset-password")
async def reset_password(tenant_id: str, _admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    owner = (
        db.table("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .eq("role", "owner")
        .maybe_single()
        .execute()
    )
    if not owner.data:
        raise HTTPException(status_code=404, detail="No owner found for this tenant")
    # Generate a temp password
    import secrets, string
    temp_pw = "Aira@" + "".join(secrets.choice(string.digits) for _ in range(6))
    db.auth.admin.update_user_by_id(owner.data["user_id"], {"password": temp_pw})
    return {"temp_password": temp_pw}
```

- [ ] **Step 2: Register operator router in `backend/app/main.py`**

Add import at top with other route imports:
```python
from app.routes import operator
```

Add after the last `app.include_router` line:
```python
app.include_router(operator.router, prefix="/api/v1/operator", tags=["operator"])
```

Note: operator router uses its own `get_system_admin` dependency — do NOT add `dependencies=_auth` here (it's already inside the dependency).

- [ ] **Step 3: Smoke test**

```bash
# List clients (should return your one tenant)
curl -H "Authorization: Bearer <your-token>" http://localhost:8000/api/v1/operator/clients
```

Expected: `{"data": [{"id": "00000000-...", "name": "...", "enabled_features": ["whatsapp", "telecalling"], ...}]}`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/operator.py backend/app/main.py backend/app/dependencies/system_admin.py
git commit -m "feat: operator API routes for client provisioning"
```

---

## Task 4: Frontend — update AuthRoleContext

**Files:**
- Modify: `frontend/app/dashboard/contexts/AuthRoleContext.tsx`

- [ ] **Step 1: Rewrite AuthRoleContext to include enabledFeatures + isSystemAdmin**

Replace the entire file with:

```typescript
"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { API_URL, getAuthHeaders } from "@/lib/api";

interface RoleCtx {
  role: "owner" | "caller" | null;
  callerId: string | null;
  enabledFeatures: string[];
  isSystemAdmin: boolean;
  loading: boolean;
}

const AuthRoleContext = createContext<RoleCtx>({
  role: null,
  callerId: null,
  enabledFeatures: ["whatsapp", "telecalling"],
  isSystemAdmin: false,
  loading: true,
});

export function AuthRoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<"owner" | "caller" | null>(null);
  const [callerId, setCallerId] = useState<string | null>(null);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>(["whatsapp", "telecalling"]);
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAuthHeaders()
      .then(async (auth) => {
        const res = await fetch(`${API_URL}/api/v1/team/me`, { headers: auth });
        if (!res.ok) throw new Error(`team/me ${res.status}`);
        const d = await res.json();
        setRole(d.role as "owner" | "caller");
        setCallerId(d.caller_id ?? null);
        setEnabledFeatures(d.enabled_features ?? ["whatsapp", "telecalling"]);
        setIsSystemAdmin(d.is_system_admin ?? false);
      })
      .catch(() => {
        setRole("owner");
        setEnabledFeatures(["whatsapp", "telecalling"]);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <AuthRoleContext.Provider value={{ role, callerId, enabledFeatures, isSystemAdmin, loading }}>
      {children}
    </AuthRoleContext.Provider>
  );
}

export const useAuthRole = () => useContext(AuthRoleContext);
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors referencing `AuthRoleContext`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/contexts/AuthRoleContext.tsx
git commit -m "feat: AuthRoleContext exposes enabledFeatures and isSystemAdmin"
```

---

## Task 5: Frontend — feature-gated sidebar

**Files:**
- Modify: `frontend/components/sidebar.tsx`

- [ ] **Step 1: Add `feature` prop to nav items and filter by enabledFeatures**

Replace the entire file with:

```typescript
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuthRole } from "@/app/dashboard/contexts/AuthRoleContext";
import {
  LayoutDashboard, MessageSquare, Users, Settings, Phone,
  BarChart2, Upload, BookOpen, Layers, FileCheck, StickyNote,
  LogOut, BookOpenCheck, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AiraLogo } from "./logo";
import { createClient } from "@/lib/supabase/client";

type NavItem = {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  feature?: string; // if set, item only shows when tenant has this feature
};

const OWNER_NAV: NavItem[] = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations", feature: "whatsapp" },
  { href: "/dashboard/leads", icon: Users, label: "Leads" },
  { href: "/dashboard/upload", icon: Upload, label: "Upload", feature: "whatsapp" },
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling", feature: "telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes", feature: "telecalling" },
  { href: "/dashboard/knowledge", icon: BookOpen, label: "Knowledge", feature: "whatsapp" },
  { href: "/dashboard/numbers", icon: Layers, label: "Numbers", feature: "telecalling" },
  { href: "/dashboard/templates", icon: FileCheck, label: "Templates", feature: "whatsapp" },
  { href: "/dashboard/bookings", icon: BookOpenCheck, label: "Bookings" },
  { href: "/dashboard/analytics", icon: BarChart2, label: "Analytics" },
  { href: "/dashboard/team", icon: Users, label: "Team" },
];

const CALLER_NAV: NavItem[] = [
  { href: "/dashboard/profile", icon: Users, label: "My Profile" },
  { href: "/dashboard/telecalling", icon: Phone, label: "Telecalling" },
  { href: "/dashboard/notes", icon: StickyNote, label: "Notes" },
  { href: "/dashboard/conversations", icon: MessageSquare, label: "Conversations" },
];

const BOTTOM_NAV: NavItem[] = [
  { href: "/dashboard/settings", icon: Settings, label: "Settings" },
];

function LogoutButton() {
  const router = useRouter();
  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={handleLogout}
      className="flex items-center gap-3 px-4 py-2.5 w-full rounded-xl text-on-surface-muted hover:bg-surface-low hover:text-on-surface transition-colors font-label text-sm font-medium"
    >
      <LogOut size={16} />
      Sign out
    </button>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { role, enabledFeatures, isSystemAdmin, loading: roleLoading } = useAuthRole();

  if (roleLoading) {
    return (
      <aside className="fixed left-0 top-0 h-full w-[220px] bg-white z-20 shadow-sidebar border-r border-border-subtle" />
    );
  }

  const baseNav = role === "caller" ? CALLER_NAV : OWNER_NAV;
  const activeNav = baseNav.filter(
    (item) => !item.feature || enabledFeatures.includes(item.feature)
  );

  return (
    <aside className="fixed left-0 top-0 h-full w-[220px] bg-white flex flex-col z-20 shadow-sidebar border-r border-border-subtle">
      {/* Brand */}
      <div className="px-5 py-5 flex items-center gap-3">
        <AiraLogo size={36} />
        <div>
          <span className="block text-ink font-display font-bold tracking-tight leading-none" style={{ fontSize: "1.15rem", letterSpacing: "-0.03em" }}>
            Aira<span className="text-primary ml-0.5">AI</span>
          </span>
          <span className="block text-ink-muted font-label" style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase", marginTop: "2px" }}>
            Lead Intelligence
          </span>
        </div>
      </div>

      <div className="mx-5 h-px bg-border-subtle" />

      <p className="px-5 pt-4 pb-1 font-label text-ink-muted" style={{ fontSize: "0.6rem", letterSpacing: "0.1em", textTransform: "uppercase" }}>
        Workspace
      </p>

      <nav className="flex-1 px-3 pb-2 space-y-0.5 overflow-y-auto">
        {activeNav.map(({ href, icon: Icon, label }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group relative",
                active ? "bg-surface-low text-primary font-medium" : "text-ink-secondary hover:bg-surface-subtle hover:text-ink"
              )}
            >
              {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />}
              <Icon size={16} className={cn("transition-colors duration-150 flex-shrink-0", active ? "text-primary" : "text-ink-muted group-hover:text-ink-secondary")} />
              <span className="font-body text-sm">{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-4 space-y-0.5">
        <div className="mx-2 mb-2 h-px bg-border-subtle" />

        {role !== "caller" && BOTTOM_NAV.map(({ href, icon: Icon, label }) => {
          const active = pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={cn("flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group", active ? "bg-surface-low text-primary font-medium" : "text-ink-secondary hover:bg-surface-subtle hover:text-ink")}>
              <Icon size={16} className="flex-shrink-0 text-ink-muted group-hover:text-ink-secondary" />
              <span className="font-body text-sm">{label}</span>
            </Link>
          );
        })}

        {/* Operator console link — only for system admins */}
        {isSystemAdmin && (
          <Link href="/operator" className={cn("flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all duration-150 group", pathname.startsWith("/operator") ? "bg-surface-low text-primary font-medium" : "text-ink-secondary hover:bg-surface-subtle hover:text-ink")}>
            <ShieldCheck size={16} className="flex-shrink-0 text-ink-muted group-hover:text-ink-secondary" />
            <span className="font-body text-sm">Operator</span>
          </Link>
        )}

        <div className="px-3 pt-2">
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-surface-low">
            <span className="live-dot" />
            <span className="font-label text-primary" style={{ fontSize: "0.65rem", fontWeight: 600, letterSpacing: "0.05em" }}>
              ALL SYSTEMS OPERATIONAL
            </span>
          </div>
        </div>
        <div className="mt-auto pt-4 border-t border-surface-mid px-0">
          <LogoutButton />
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Manual check**

Start dev server (`npm run dev` in `frontend/`). Log in. Sidebar should show all items (your tenant has both features). No visual change yet until you test with a restricted tenant.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/sidebar.tsx
git commit -m "feat: sidebar gates nav items by enabled_features"
```

---

## Task 6: Frontend — operator page

**Files:**
- Create: `frontend/app/operator/layout.tsx`
- Create: `frontend/app/operator/page.tsx`

- [ ] **Step 1: Create operator layout**

Create `frontend/app/operator/layout.tsx`:

```typescript
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900">Aira<span className="text-indigo-600">AI</span></span>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest border border-gray-200 rounded px-2 py-0.5">Operator Console</span>
        </div>
        <a href="/dashboard" className="text-sm text-gray-500 hover:text-gray-800">← Back to Dashboard</a>
      </header>
      <main className="max-w-5xl mx-auto px-8 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create operator page**

Create `frontend/app/operator/page.tsx`:

```typescript
"use client";
import { useEffect, useState } from "react";
import { Plus, Pencil, RefreshCw, PowerOff, Power } from "lucide-react";
import { API_URL, getAuthHeaders } from "@/lib/api";

type ServiceTier = "whatsapp_only" | "telecalling_only" | "combined";

type Client = {
  id: string;
  name: string;
  enabled_features: string[];
  status: string;
  created_at: string;
  owner_user_id: string | null;
};

const SERVICE_LABELS: Record<string, string> = {
  whatsapp_only: "WhatsApp Only",
  telecalling_only: "Telecalling Only",
  combined: "Combined",
};

function featuresToService(features: string[]): string {
  if (features.includes("whatsapp") && features.includes("telecalling")) return "combined";
  if (features.includes("whatsapp")) return "whatsapp_only";
  if (features.includes("telecalling")) return "telecalling_only";
  return "combined";
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { "Content-Type": "application/json", ...auth, ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Request failed");
  }
  return res.json();
}

export default function OperatorPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tempPw, setTempPw] = useState<{ name: string; pw: string } | null>(null);

  // Create form state
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [service, setService] = useState<ServiceTier>("combined");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await apiFetch<{ data: Client[] }>("/api/v1/operator/clients");
      setClients(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch("/api/v1/operator/clients", {
        method: "POST",
        body: JSON.stringify({ company_name: companyName, email, password, service }),
      });
      setShowCreate(false);
      setCompanyName(""); setEmail(""); setPassword(""); setService("combined");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create client");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateService(tenantId: string, newService: ServiceTier) {
    try {
      await apiFetch(`/api/v1/operator/clients/${tenantId}/features`, {
        method: "PATCH",
        body: JSON.stringify({ service: newService }),
      });
      setEditClient(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    }
  }

  async function handleToggleStatus(client: Client) {
    const newStatus = client.status === "active" ? "suspended" : "active";
    try {
      await apiFetch(`/api/v1/operator/clients/${client.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  async function handleResetPassword(client: Client) {
    if (!confirm(`Reset password for ${client.name}?`)) return;
    try {
      const res = await apiFetch<{ temp_password: string }>(`/api/v1/operator/clients/${client.id}/reset-password`, { method: "POST" });
      setTempPw({ name: client.name, pw: res.temp_password });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset password");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">Provision and manage tenant accounts.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus size={14} /> New Client
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {tempPw && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-800">Password reset for {tempPw.name}</p>
          <p className="text-sm text-green-700 mt-1">Temp password: <code className="font-mono bg-green-100 px-2 py-0.5 rounded">{tempPw.pw}</code></p>
          <button onClick={() => setTempPw(null)} className="text-xs text-green-600 mt-2 underline">Dismiss</button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">New Client</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Company Name *</label>
                <input value={companyName} onChange={e => setCompanyName(e.target.value)} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="ABC Coaching" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Owner Email *</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="owner@client.com" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Temporary Password *</label>
                <input type="text" value={password} onChange={e => setPassword(e.target.value)} required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Aira@123456" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Service</label>
                <select value={service} onChange={e => setService(e.target.value as ServiceTier)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="combined">Combined (WhatsApp + Telecalling)</option>
                  <option value="whatsapp_only">WhatsApp Only</option>
                  <option value="telecalling_only">Telecalling Only</option>
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 border border-gray-200 text-sm text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit service modal */}
      {editClient && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Edit Service</h2>
            <p className="text-sm text-gray-500 mb-4">{editClient.name}</p>
            <div className="space-y-2">
              {(["combined", "whatsapp_only", "telecalling_only"] as ServiceTier[]).map(tier => (
                <button key={tier} onClick={() => handleUpdateService(editClient.id, tier)} className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 text-sm hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                  {SERVICE_LABELS[tier]}
                </button>
              ))}
            </div>
            <button onClick={() => setEditClient(null)} className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
        </div>
      )}

      {/* Clients table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-400">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-gray-900 font-semibold">No clients yet</p>
            <p className="text-sm text-gray-400 mt-1">Create your first client to get started.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {["Company", "Service", "Status", "Created", "Actions"].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {clients.map(client => (
                <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-semibold text-gray-900">{client.name}</p>
                    <p className="text-xs text-gray-400">{client.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">
                      {SERVICE_LABELS[featuresToService(client.enabled_features)] ?? "Custom"}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${client.status === "active" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                      {client.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-gray-400">
                    {new Date(client.created_at).toLocaleDateString("en-IN")}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditClient(client)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Edit service">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => handleResetPassword(client)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Reset password">
                        <RefreshCw size={13} />
                      </button>
                      <button onClick={() => handleToggleStatus(client)} className={`p-1.5 rounded hover:bg-gray-100 ${client.status === "active" ? "text-gray-400 hover:text-red-500" : "text-gray-400 hover:text-green-600"}`} title={client.status === "active" ? "Suspend" : "Activate"}>
                        {client.status === "active" ? <PowerOff size={13} /> : <Power size={13} />}
                      </button>
                    </div>
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

- [ ] **Step 3: Verify TypeScript**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Build check**

```bash
cd frontend && npm run build 2>&1 | tail -20
```

Expected: ✓ compiled successfully.

- [ ] **Step 5: Manual test — full flow**

1. Start both servers.
2. Log in as Prem.
3. Sidebar shows "Operator" link at bottom (you are system admin).
4. Navigate to `/operator` — see your one existing client.
5. Click "New Client" → fill form → Create.
6. New row appears in table.
7. Click Pencil → change service to "WhatsApp Only" → confirm.
8. Log in as the new client → sidebar shows only WhatsApp items (Conversations, Upload, Knowledge, Templates). No Telecalling, Numbers, Notes.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/operator/layout.tsx frontend/app/operator/page.tsx
git commit -m "feat: operator console — client provisioning and service tier management"
```

---

## Self-Review

**Spec coverage:**
- ✅ `enabled_features` on tenants (migration 041)
- ✅ `system_admins` table (migration 042)
- ✅ `team/me` returns features + admin flag (Task 2)
- ✅ `get_system_admin` dependency — gates operator routes (Task 3)
- ✅ Operator CRUD — list, create, update features, reset password, suspend (Task 3)
- ✅ `AuthRoleContext` exposes `enabledFeatures` + `isSystemAdmin` (Task 4)
- ✅ Sidebar filters by feature (Task 5)
- ✅ Operator link only visible to system admins (Task 5)
- ✅ `/operator` page with full client management UI (Task 6)

**Gaps / intentionally deferred:**
- Backend `require_feature()` route-level dependency not added — sidebar gating is sufficient for now; route-level hardening can be done when modular billing ships
- `suspend` status doesn't block login yet — that requires Supabase auth user disable, deferred
- WhatsApp-only clients can still hit telecalling API routes directly — acceptable until route-level gating is added

**No placeholders confirmed** — all code blocks are complete.
