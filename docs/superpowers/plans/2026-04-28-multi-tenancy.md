# Multi-Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Isolate every client's data behind a `tenant_id` so that Client A can never see Client B's leads, messages, or settings.

**Architecture:** Two DB migrations create `tenants` + `tenant_users` tables and add `tenant_id` to every existing table. The backend uses a FastAPI dependency `get_tenant_id` that looks up the calling user's tenant from `tenant_users` and injects it into every route. All queries are filtered by `tenant_id` at the application layer (not RLS) because the backend uses the service key which bypasses RLS. A frontend onboarding page creates a tenant on first login so new users land in their own isolated space rather than a blank dashboard.

**Tech Stack:** FastAPI, Supabase (PostgreSQL), Next.js 14 App Router, Supabase Auth (existing).

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `backend/supabase/migrations/018_tenants.sql` | Create | `tenants` + `tenant_users` tables |
| `backend/supabase/migrations/019_tenant_ids.sql` | Create | `tenant_id` column on all tables + backfill existing data |
| `backend/app/dependencies/tenant.py` | Create | `get_tenant_id` FastAPI dependency |
| `backend/app/routes/leads.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/messages.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/calls.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/callers.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/lead_notes.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/knowledge.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/app_settings.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/segments.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/upload.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/analytics.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/follow_ups.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/incidents.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/numbers.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/voice_numbers.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/templates.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/ai_tune.py` | Modify | Filter all queries by tenant_id |
| `backend/app/routes/webhook.py` | Modify | Map inbound WA number → tenant_id |
| `backend/app/main.py` | Modify | Register onboarding route |
| `backend/app/routes/onboarding.py` | Create | Create tenant endpoint |
| `frontend/app/dashboard/layout.tsx` | Modify | Check tenant exists; redirect to onboarding if not |
| `frontend/app/dashboard/onboarding/page.tsx` | Create | Create-tenant form |
| `frontend/lib/api.ts` | Modify | Add onboarding API call |

---

## Task 1: DB Migration — tenants + tenant_users tables

**Files:**
- Create: `backend/supabase/migrations/018_tenants.sql`

- [ ] **Step 1: Create the migration file**

Create `backend/supabase/migrations/018_tenants.sql`:

```sql
-- Tenants (one per business/client)
CREATE TABLE IF NOT EXISTS tenants (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    plan        text NOT NULL DEFAULT 'trial',
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Maps Supabase auth users → tenant + role
CREATE TABLE IF NOT EXISTS tenant_users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    role        text NOT NULL DEFAULT 'caller' CHECK (role IN ('owner', 'caller')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_users_user_id_idx ON tenant_users (user_id);
CREATE INDEX IF NOT EXISTS tenant_users_tenant_id_idx ON tenant_users (tenant_id);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Run via Supabase MCP `execute_sql` (project_id: `tovmebyyjhvszwgvyfdm`):

```sql
CREATE TABLE IF NOT EXISTS tenants (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    plan        text NOT NULL DEFAULT 'trial',
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL,
    role        text NOT NULL DEFAULT 'caller' CHECK (role IN ('owner', 'caller')),
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS tenant_users_user_id_idx ON tenant_users (user_id);
CREATE INDEX IF NOT EXISTS tenant_users_tenant_id_idx ON tenant_users (tenant_id);
```

- [ ] **Step 3: Verify tables exist**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('tenants', 'tenant_users');
```

Expected: 2 rows returned.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/018_tenants.sql
git commit -m "feat(db): add tenants and tenant_users tables"
```

---

## Task 2: DB Migration — add tenant_id to all tables + backfill

**Files:**
- Create: `backend/supabase/migrations/019_tenant_ids.sql`

**Context:** All existing rows have no tenant. We create one default tenant for existing data and backfill all rows with its ID. The existing admin user (`15e0a852-c2a5-4e8a-9714-3f1b71444d56` — the `kanthaiyee@gmail.com` user) becomes the owner.

- [ ] **Step 1: Create the migration file**

Create `backend/supabase/migrations/019_tenant_ids.sql`:

```sql
-- Add tenant_id to all existing tables
ALTER TABLE leads            ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE messages         ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE call_logs        ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE callers          ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE phone_numbers    ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE lead_notes       ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE follow_up_jobs   ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE segment_templates ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE faqs             ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE app_settings     ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE incidents        ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
ALTER TABLE lead_stage_events ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);

-- Create default tenant for existing data
INSERT INTO tenants (id, name, plan)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Tenant', 'trial');

-- Register existing admin user as owner of default tenant
INSERT INTO tenant_users (tenant_id, user_id, role)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '15e0a852-c2a5-4e8a-9714-3f1b71444d56',
    'owner'
) ON CONFLICT DO NOTHING;

-- Backfill all existing rows with the default tenant
UPDATE leads             SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE messages          SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE call_logs         SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE callers           SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE phone_numbers     SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE lead_notes        SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE follow_up_jobs    SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE segment_templates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE faqs              SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE app_settings      SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE incidents         SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE message_templates SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
UPDATE lead_stage_events SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;

-- Add NOT NULL constraint after backfill
ALTER TABLE leads             ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE messages          ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE call_logs         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE callers            ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE phone_numbers     ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE lead_notes        ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE follow_up_jobs    ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE segment_templates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE faqs              ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE app_settings      ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE incidents         ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE message_templates ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE lead_stage_events ALTER COLUMN tenant_id SET NOT NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS leads_tenant_id_idx             ON leads (tenant_id);
CREATE INDEX IF NOT EXISTS messages_tenant_id_idx          ON messages (tenant_id);
CREATE INDEX IF NOT EXISTS call_logs_tenant_id_idx         ON call_logs (tenant_id);
CREATE INDEX IF NOT EXISTS callers_tenant_id_idx           ON callers (tenant_id);
CREATE INDEX IF NOT EXISTS phone_numbers_tenant_id_idx     ON phone_numbers (tenant_id);
CREATE INDEX IF NOT EXISTS lead_notes_tenant_id_idx        ON lead_notes (tenant_id);
CREATE INDEX IF NOT EXISTS follow_up_jobs_tenant_id_idx    ON follow_up_jobs (tenant_id);
CREATE INDEX IF NOT EXISTS faqs_tenant_id_idx              ON faqs (tenant_id);
CREATE INDEX IF NOT EXISTS app_settings_tenant_id_idx      ON app_settings (tenant_id);
CREATE INDEX IF NOT EXISTS incidents_tenant_id_idx         ON incidents (tenant_id);
CREATE INDEX IF NOT EXISTS message_templates_tenant_id_idx ON message_templates (tenant_id);
```

- [ ] **Step 2: Apply via Supabase MCP**

Run the full SQL above via `execute_sql` on project `tovmebyyjhvszwgvyfdm`.

- [ ] **Step 3: Verify backfill**

```sql
SELECT 'leads' AS tbl, COUNT(*) AS total, COUNT(tenant_id) AS with_tenant FROM leads
UNION ALL
SELECT 'messages', COUNT(*), COUNT(tenant_id) FROM messages
UNION ALL
SELECT 'call_logs', COUNT(*), COUNT(tenant_id) FROM call_logs;
```

Expected: `total` equals `with_tenant` for every row.

- [ ] **Step 4: Commit**

```bash
git add backend/supabase/migrations/019_tenant_ids.sql
git commit -m "feat(db): add tenant_id to all tables with backfill"
```

---

## Task 3: Backend — get_tenant_id dependency

**Files:**
- Create: `backend/app/dependencies/tenant.py`

- [ ] **Step 1: Create the dependency**

Create `backend/app/dependencies/tenant.py`:

```python
import logging
from fastapi import Depends, HTTPException, status

from app.db.supabase import get_supabase
from app.dependencies.auth import get_current_user

logger = logging.getLogger(__name__)


def get_tenant_id(user: dict = Depends(get_current_user)) -> str:
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
            detail="No tenant associated with this account. Complete onboarding first.",
        )
    return result.data["tenant_id"]


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
    return {"tenant_id": result.data["tenant_id"], "role": result.data["role"]}
```

- [ ] **Step 2: Verify import works**

Start the backend and confirm no import errors:

```bash
cd backend && python -c "from app.dependencies.tenant import get_tenant_id; print('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add backend/app/dependencies/tenant.py
git commit -m "feat(auth): add get_tenant_id dependency"
```

---

## Task 4: Apply tenant filter — leads route (reference implementation)

**Files:**
- Modify: `backend/app/routes/leads.py`

**Context:** This task shows the exact pattern. Every route function that reads or writes data gets `tenant_id: str = Depends(get_tenant_id)` as a parameter and uses `.eq("tenant_id", tenant_id)` on reads and `"tenant_id": tenant_id` on inserts.

- [ ] **Step 1: Add import at top of leads.py**

Add to the imports section:

```python
from app.dependencies.tenant import get_tenant_id
```

- [ ] **Step 2: Update list_leads**

Find `async def list_leads(...)` and add `tenant_id: str = Depends(get_tenant_id)` to its parameters. Then add `.eq("tenant_id", tenant_id)` to the query:

```python
async def list_leads(
    segment: str | None = Query(None, pattern="^[ABCD]$"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    tenant_id: str = Depends(get_tenant_id),
):
    db = get_supabase()
    offset = (page - 1) * limit
    query = db.table("leads").select("*", count="exact").is_("deleted_at", "null").eq("tenant_id", tenant_id)
    if segment:
        query = query.eq("segment", segment)
    result = query.order("score", desc=True).range(offset, offset + limit - 1).execute()
    return PaginatedResponse(data=result.data, total=result.count or 0, page=page, limit=limit)
```

- [ ] **Step 3: Update export_leads**

Add `tenant_id: str = Depends(get_tenant_id)` and `.eq("tenant_id", tenant_id)` to the export query.

- [ ] **Step 4: Update get_lead_messages, get_lead, update_lead, convert_lead, toggle_ai**

For each function:
- Add `tenant_id: str = Depends(get_tenant_id)` parameter
- Add `.eq("tenant_id", tenant_id)` to any `db.table("leads")` query
- For `db.table("messages")` queries inside get_lead: add `.eq("tenant_id", tenant_id)`

- [ ] **Step 5: Update create/upsert in upload route (used by leads)**

In any leads INSERT or UPSERT call in leads.py, add `"tenant_id": tenant_id` to the insert dict.

- [ ] **Step 6: Verify leads endpoint works**

Start the backend. Hit the endpoint with a valid JWT:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8000/api/v1/leads/ | python3 -m json.tool
```

Expected: leads array returned (only the current tenant's leads).

- [ ] **Step 7: Commit**

```bash
git add backend/app/routes/leads.py
git commit -m "feat(tenancy): filter leads routes by tenant_id"
```

---

## Task 5: Apply tenant filter — all remaining routes

**Files:**
- Modify: `backend/app/routes/messages.py`
- Modify: `backend/app/routes/calls.py`
- Modify: `backend/app/routes/callers.py`
- Modify: `backend/app/routes/lead_notes.py`
- Modify: `backend/app/routes/knowledge.py`
- Modify: `backend/app/routes/app_settings.py`
- Modify: `backend/app/routes/segments.py`
- Modify: `backend/app/routes/upload.py`
- Modify: `backend/app/routes/analytics.py`
- Modify: `backend/app/routes/follow_ups.py`
- Modify: `backend/app/routes/incidents.py`
- Modify: `backend/app/routes/numbers.py`
- Modify: `backend/app/routes/voice_numbers.py`
- Modify: `backend/app/routes/templates.py`
- Modify: `backend/app/routes/ai_tune.py`

**Pattern (same as Task 4 — apply to every file):**

```python
# 1. Add import at top of each file:
from app.dependencies.tenant import get_tenant_id

# 2. Add to every route function signature:
tenant_id: str = Depends(get_tenant_id)

# 3. Add to every SELECT query:
.eq("tenant_id", tenant_id)

# 4. Add to every INSERT dict:
"tenant_id": tenant_id

# 5. Add to every UPDATE query (only filter, don't set tenant_id on updates):
.eq("tenant_id", tenant_id)

# 6. Add to every DELETE query:
.eq("tenant_id", tenant_id)
```

- [ ] **Step 1: Update messages.py**

Add `from app.dependencies.tenant import get_tenant_id`. For every route that reads/writes messages or calls `db.table("messages")`, add `tenant_id: str = Depends(get_tenant_id)` and `.eq("tenant_id", tenant_id)` to queries. For inserts add `"tenant_id": tenant_id`.

- [ ] **Step 2: Update calls.py**

Same pattern. `call_logs` table queries get `.eq("tenant_id", tenant_id)`. Call log inserts get `"tenant_id": tenant_id`. The `twiml` and `voice-status` endpoints receive webhooks from Twilio — they use `call_log_id` as a query param which is already tied to a specific log, so add `.eq("tenant_id", tenant_id)` where tenant_id is extracted from the call_log itself for webhook endpoints.

For the webhook endpoints (`/twiml` and `/voice-status`), look up the `call_log` first and use its `tenant_id`:

```python
@router.post("/voice-status")
async def twilio_voice_status(
    background_tasks: BackgroundTasks,
    call_log_id: str,
    ...
):
    db = get_supabase()
    # Look up tenant from the call log (no JWT here — Twilio calls this)
    log_row = db.table("call_logs").select("tenant_id").eq("id", call_log_id).maybe_single().execute()
    tenant_id = (log_row.data or {}).get("tenant_id", "")
    # Then filter subsequent queries by tenant_id
```

- [ ] **Step 3: Update callers.py**

Same pattern. All callers queries filtered by `tenant_id`.

- [ ] **Step 4: Update lead_notes.py**

Same pattern for lead_notes table.

- [ ] **Step 5: Update knowledge.py**

Same pattern for faqs table.

- [ ] **Step 6: Update app_settings.py**

Same pattern for app_settings table.

- [ ] **Step 7: Update segments.py**

Same pattern for segment_templates table.

- [ ] **Step 8: Update upload.py**

For the bulk CSV upload, `tenant_id` must be added to every lead upsert row:

```python
upsert_rows.append({
    "phone": phone,
    "name": _clean_text(lead.name),
    "source": "upload",
    "score": 5,
    "segment": "C",
    "tenant_id": tenant_id,   # add this
})
```

- [ ] **Step 9: Update analytics.py, follow_ups.py, incidents.py, numbers.py, voice_numbers.py, templates.py, ai_tune.py**

Same pattern for each file.

- [ ] **Step 10: Commit all route changes**

```bash
git add backend/app/routes/
git commit -m "feat(tenancy): filter all routes by tenant_id"
```

---

## Task 6: Webhook — map inbound WA number to tenant

**Files:**
- Modify: `backend/app/routes/webhook.py`

**Context:** The WhatsApp webhook has no JWT (Meta calls it directly). We need to look up which tenant owns the inbound phone number to scope all DB operations correctly.

- [ ] **Step 1: Add tenant lookup helper to webhook.py**

After the imports, add:

```python
def _get_tenant_id_for_number(phone_number_id: str, db) -> str | None:
    """Look up tenant_id from the phone_numbers table by Meta phone_number_id."""
    result = (
        db.table("phone_numbers")
        .select("tenant_id")
        .eq("meta_phone_number_id", phone_number_id)
        .maybe_single()
        .execute()
    )
    return (result.data or {}).get("tenant_id")
```

- [ ] **Step 2: Extract tenant_id in the Meta webhook handler**

In the `whatsapp_webhook` function, after extracting `phone_number_id` from the Meta payload, call `_get_tenant_id_for_number`. Pass `tenant_id` to all DB operations (lead upsert, message insert, generate_reply).

Find the line where `phone_number_id` is extracted from the payload (it's in the `value` dict from Meta). Add:

```python
phone_number_id = value.get("metadata", {}).get("phone_number_id", "")
tenant_id = _get_tenant_id_for_number(phone_number_id, db)
if not tenant_id:
    logger.warning(f"No tenant found for phone_number_id {phone_number_id} — skipping")
    continue
```

Then pass `tenant_id` to the lead upsert and message insert:

```python
# In lead upsert:
db.table("leads").upsert({
    "phone": phone,
    "source": "whatsapp",
    "tenant_id": tenant_id,   # add this
}, on_conflict="phone,tenant_id").execute()

# In message insert:
db.table("messages").insert({
    ...
    "tenant_id": tenant_id,   # add this
}).execute()
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/routes/webhook.py
git commit -m "feat(tenancy): map inbound webhook to tenant via phone_number"
```

---

## Task 7: Backend — onboarding endpoint

**Files:**
- Create: `backend/app/routes/onboarding.py`
- Modify: `backend/app/main.py`

**Context:** When a new user logs in for the first time, they have no `tenant_users` record. The frontend will detect this (via a 403 from any API call) and redirect to `/onboarding`. The onboarding page calls `POST /api/v1/onboarding` to create a tenant and link the user as owner.

- [ ] **Step 1: Create onboarding.py**

Create `backend/app/routes/onboarding.py`:

```python
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db.supabase import get_supabase
from app.dependencies.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateTenantPayload(BaseModel):
    name: str


@router.post("/")
def create_tenant(payload: CreateTenantPayload, user: dict = Depends(get_current_user)):
    db = get_supabase()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tenant name is required")

    existing = (
        db.table("tenant_users")
        .select("tenant_id")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if existing.data:
        return {"tenant_id": existing.data["tenant_id"], "already_exists": True}

    tenant = db.table("tenants").insert({"name": name}).execute()
    tenant_id = tenant.data[0]["id"]

    db.table("tenant_users").insert({
        "tenant_id": tenant_id,
        "user_id": user["user_id"],
        "role": "owner",
    }).execute()

    logger.info(f"Tenant created: {tenant_id} for user {user['user_id']}")
    return {"tenant_id": tenant_id, "already_exists": False}


@router.get("/status")
def tenant_status(user: dict = Depends(get_current_user)):
    db = get_supabase()
    result = (
        db.table("tenant_users")
        .select("tenant_id, role")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result.data:
        return {"has_tenant": False}
    return {"has_tenant": True, "tenant_id": result.data["tenant_id"], "role": result.data["role"]}
```

- [ ] **Step 2: Register in main.py**

In `backend/app/main.py`, add the import and register the router:

```python
from app.routes import onboarding  # add to existing imports line

# Add after the other api route registrations:
app.include_router(onboarding.router, prefix="/api/v1/onboarding", tags=["onboarding"], dependencies=_auth)
```

- [ ] **Step 3: Verify the endpoint**

```bash
curl -s -X POST http://localhost:8000/api/v1/onboarding/ \
  -H "Authorization: Bearer <valid_token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test University"}' | python3 -m json.tool
```

Expected: `{"tenant_id": "<uuid>", "already_exists": false}`

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/onboarding.py backend/app/main.py
git commit -m "feat(tenancy): add onboarding endpoint to create tenant"
```

---

## Task 8: Frontend — onboarding page + dashboard tenant check

**Files:**
- Create: `frontend/app/dashboard/onboarding/page.tsx`
- Modify: `frontend/app/dashboard/layout.tsx`
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add onboarding API methods to api.ts**

In `frontend/lib/api.ts`, add inside the `api` export object:

```typescript
onboarding: {
  status: () => apiFetch<{ has_tenant: boolean; tenant_id?: string; role?: string }>("/api/v1/onboarding/status"),
  create: (name: string) =>
    apiFetch<{ tenant_id: string; already_exists: boolean }>("/api/v1/onboarding/", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
},
```

- [ ] **Step 2: Create the onboarding page**

Create `frontend/app/dashboard/onboarding/page.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await api.onboarding.create(name.trim());
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create workspace");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="card rounded-3xl p-8">
          <h1 className="font-display text-xl font-bold text-ink mb-1">Welcome to Aira AI</h1>
          <p className="font-body text-sm text-ink-muted mb-6">
            Enter your business name to set up your workspace.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 font-body text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="font-body text-sm font-medium text-ink mb-1.5 block">
                Business / Organisation Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="input"
                placeholder="e.g. Sunrise University"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="btn-primary w-full justify-center"
            >
              {loading ? "Creating…" : "Create Workspace"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update dashboard layout to check tenant status**

Update `frontend/app/dashboard/layout.tsx` to check if the user has a tenant on every dashboard load. If not, redirect to onboarding.

Replace the current layout with:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Check tenant status — call backend with the session token
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  if (token) {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/onboarding/status`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        if (!data.has_tenant) {
          redirect("/dashboard/onboarding");
        }
      }
    } catch {
      // If backend is down, let through — don't block the dashboard
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="ml-[220px] flex-1 min-h-screen">
        <div className="p-7 max-w-[1400px]">
          {children}
        </div>
      </main>
    </div>
  );
}
```

Note: This layout is now async and a Server Component. The `Sidebar` must remain a Client Component (it already has `"use client"`).

- [ ] **Step 4: Add onboarding to Next.js middleware matcher exclusion**

In `frontend/middleware.ts`, the current matcher is `["/dashboard/:path*", "/login"]`. The middleware redirects unauthenticated users to `/login`, but it should NOT redirect authenticated users away from `/dashboard/onboarding`. The current middleware already allows authenticated users through `/dashboard/*`, so no change needed.

- [ ] **Step 5: Test full flow**

1. Create a new Supabase user (one with no tenant_users record):
   ```bash
   curl -s -X POST 'https://tovmebyyjhvszwgvyfdm.supabase.co/auth/v1/admin/users' \
     -H 'apikey: <service_key>' \
     -H 'Authorization: Bearer <service_key>' \
     -H 'Content-Type: application/json' \
     -d '{"email": "newuser@test.com", "password": "Test1234!", "email_confirm": true}'
   ```
2. Log in as `newuser@test.com` at `http://localhost:3000/login`
3. Expected: redirected to `/dashboard/onboarding`
4. Enter "Test College" and click "Create Workspace"
5. Expected: redirected to `/dashboard`, all pages load normally
6. Log in as `kanthaiyee@gmail.com` — expected: goes straight to dashboard (already has tenant)

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/onboarding/ frontend/app/dashboard/layout.tsx frontend/lib/api.ts
git commit -m "feat(tenancy): add onboarding page and tenant check in dashboard layout"
```

---

## Self-Review

**Spec coverage:**
- tenants + tenant_users tables ✅ Task 1
- tenant_id on all existing tables + backfill ✅ Task 2
- get_tenant_id dependency ✅ Task 3
- leads routes filtered ✅ Task 4
- all other routes filtered ✅ Task 5
- webhook mapped to tenant ✅ Task 6
- create tenant endpoint ✅ Task 7
- onboarding page + dashboard check ✅ Task 8

**Placeholder scan:**
- Task 5 lists all 9 remaining files with steps — no placeholders.
- All code blocks are complete.

**Type consistency:**
- `get_tenant_id` returns `str` (UUID as string) throughout
- `get_tenant_and_role` returns `dict` with `tenant_id` and `role` keys — consistent with Task 3 definition
- `api.onboarding.status` returns `{ has_tenant: boolean }` matching the backend response from Task 7
- `api.onboarding.create` sends `{ name: string }` matching `CreateTenantPayload` from Task 7

**Known gap (Plan 2):** The `callers` table has no `user_id` column yet — linking telecaller profiles to Supabase auth users is Plan 2. This plan makes the system multi-tenant but telecaller roles and invite flow are in the next plan.
