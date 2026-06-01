# RLS Storage Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Aira AI's Supabase data layer safe for paying SaaS clients by enabling reviewed RLS, removing public lead-file exposure, and recording sensitive admin actions in immutable app audit logs.

**Architecture:** Keep the FastAPI backend as the trusted service-role boundary, while adding Supabase RLS as defense in depth for all exposed public tables. Storage downloads move from public URLs to backend-issued signed URLs. Sensitive operator/settings actions write append-only audit events.

**Tech Stack:** FastAPI, Supabase Postgres/Auth/Storage, Supabase SQL migrations, pytest, Next.js.

---

## Safety Rules

- Do not apply RLS directly to production first.
- Build and test the migration locally or on a Supabase dev branch.
- Do not enable RLS without policies on tables the frontend/backend needs through authenticated client access.
- Do not make CSV or recording buckets public.
- Keep service-role backend operations working, but remove accidental anon/auth exposure.

---

## Table Policy Groups

**Tenant-owned tables:** `leads`, `messages`, `call_logs`, `callers`, `phone_numbers`, `voice_numbers`, `app_settings`, `message_templates`, `bookings`, `lead_notes`, `lead_stage_events`, `follow_up_jobs`, `knowledge_documents`, `knowledge_chunks`, `hot_lead_alerts`, `chat_handovers`, `automations`, `automation_steps`, `automation_logs`, `automation_pending_executions`, `broadcast_recipients`, `broadcast_failed_contacts`, `scheduled_broadcasts`, `caller_status_logs`, `caller_digests`, `whatsapp_insights_snapshots`, `incidents`, `ad_campaigns`, `ai_prompts`, `ai_tune_suggestions`, `lead_conversation_state`.

**Membership tables:** `tenants`, `tenant_users`.

**System-only tables:** `system_admins`, operator-only global tables, future billing admin tables.

**Legacy/global tables to review before policy:** `faqs`, `segment_templates`, `conversations`, `meta_templates`, `bot_flows`. If these are tenant-owned in practice, add `tenant_id` policies. If not, lock them down and access only through service role.

---

### Task 1: Add Static Security Tests

**Files:**
- Create/modify: `backend/tests/test_rls_storage_audit_static.py`

- [ ] Add tests that assert a migration contains:
  - `create table if not exists public.app_audit_logs`
  - `alter table public.leads enable row level security`
  - tenant membership helper function
  - no public read policy for `broadcast-csvs`
  - `update storage.buckets set public = false`

- [ ] Add tests that assert backend has:
  - `backend/app/services/audit_log.py`
  - audit calls in `operator.py`
  - audit calls in `app_settings.py`
  - signed CSV download endpoint or signed URL helper

- [ ] Run:
  - `PYTHONPATH=. ./.venv/bin/pytest tests/test_rls_storage_audit_static.py -q`

Expected first run: fail until implementation exists.

---

### Task 2: Create Audit Log Table Migration

**Files:**
- Create/modify: `backend/supabase/migrations/072_security_hardening.sql`

- [ ] Create `public.app_audit_logs`:
  - `id uuid primary key default gen_random_uuid()`
  - `tenant_id uuid null references public.tenants(id)`
  - `actor_user_id uuid null`
  - `actor_role text null`
  - `action text not null`
  - `target_type text not null`
  - `target_id text null`
  - `metadata jsonb not null default '{}'::jsonb`
  - `created_at timestamptz not null default now()`

- [ ] Add indexes:
  - `(tenant_id, created_at desc)`
  - `(actor_user_id, created_at desc)`
  - `(action, created_at desc)`

- [ ] Enable RLS on `app_audit_logs`.

- [ ] Policy:
  - tenant owners can read logs for their tenant
  - normal tenant members cannot insert/update/delete logs
  - service role inserts logs through backend

---

### Task 3: Add Backend Audit Helper

**Files:**
- Create: `backend/app/services/audit_log.py`

- [ ] Implement:
  - `record_audit_event(db, tenant_id, actor_user_id, actor_role, action, target_type, target_id=None, metadata=None)`

- [ ] Behavior:
  - inserts into `app_audit_logs`
  - never raises to user request if audit insert fails
  - logs failures server-side
  - strips obvious secrets from metadata keys like `password`, `token`, `secret`, `key`

- [ ] Verification:
  - `python3 -m compileall -q backend/app backend/tests`

---

### Task 4: Wire Operator Audit Events

**Files:**
- Modify: `backend/app/routes/operator.py`

- [ ] Add audit events for:
  - client created
  - features updated
  - status changed
  - leads wiped
  - password reset

- [ ] Metadata should include safe operational context only:
  - service tier, old/new status if available, counts, target tenant id
  - never include temporary plaintext password

- [ ] Verification:
  - targeted static test passes
  - compile passes

---

### Task 5: Wire Settings Audit Events

**Files:**
- Modify: `backend/app/routes/app_settings.py`

- [ ] Add audit event after settings update.

- [ ] Metadata:
  - list of updated keys
  - activation/status action
  - mask secrets; do not store values for tokens/secrets/passwords

- [ ] Verification:
  - targeted static test passes
  - compile passes

---

### Task 6: Add Tenant Membership SQL Helper

**Files:**
- Modify: `backend/supabase/migrations/072_security_hardening.sql`

- [ ] Add function:
  - `public.is_tenant_member(p_tenant_id uuid)`
  - returns true when `auth.uid()` exists in `tenant_users` for that tenant
  - `security definer`
  - fixed `search_path = public, pg_temp`

- [ ] Add function:
  - `public.is_system_admin()`
  - returns true when `auth.uid()` exists in `system_admins`
  - fixed `search_path = public, pg_temp`

- [ ] Keep functions minimal and stable.

---

### Task 7: Enable RLS On Tenant Tables

**Files:**
- Modify: `backend/supabase/migrations/072_security_hardening.sql`

- [ ] For each tenant-owned table with `tenant_id`, enable RLS.

- [ ] Add policies:
  - tenant members can `select` their tenant rows
  - tenant owners can `insert/update/delete` where product needs client-side access
  - most writes should remain backend service-role only unless frontend Supabase client writes directly

- [ ] For tables without `tenant_id` but linked through `lead_id` or `booking_id`, either:
  - add tenant_id before enabling practical policy, or
  - create join-based policy through parent table.

- [ ] Do not guess for ambiguous tables; lock down and route through backend if unclear.

---

### Task 8: Lock System Tables

**Files:**
- Modify: `backend/supabase/migrations/072_security_hardening.sql`

- [ ] Enable RLS on:
  - `system_admins`
  - any global/operator-only tables

- [ ] Policies:
  - system admins can read where needed
  - no anon access
  - no authenticated write access
  - backend service role remains unaffected

---

### Task 9: Private Broadcast CSV Storage

**Files:**
- Modify: `backend/supabase/migrations/072_security_hardening.sql`
- Modify: `backend/app/routes/upload.py`

- [ ] Migration:
  - `update storage.buckets set public = false where id = 'broadcast-csvs'`
  - drop broad public select policy
  - add authenticated tenant-folder policies if direct client upload/download is needed

- [ ] Backend:
  - stop returning permanent public CSV URLs
  - add endpoint to create short-lived signed URLs for a tenant-owned CSV
  - verify requested path starts with current `tenant_id/`

- [ ] Frontend follow-up:
  - change CSV download/open actions to call backend signed-url endpoint.

---

### Task 10: Fix Function Search Path Warnings

**Files:**
- Modify: `backend/supabase/migrations/072_security_hardening.sql`

- [ ] Add `alter function ... set search_path = public, pg_temp` for advisor-flagged functions:
  - `update_updated_at`
  - `generate_booking_ref`
  - `increment_phone_daily_send_count`
  - `get_conversation_leads`
  - `update_updated_at_column`
  - `toggle_lead_pin`
  - `increment_lead_no_reply_count`

- [ ] Verify against current Supabase advisor output before applying.

---

### Task 11: Local Verification

**Files:**
- No new files.

- [ ] Run:
  - `PYTHONPATH=. ./.venv/bin/pytest tests/test_rls_storage_audit_static.py tests/test_security_hardening_static.py tests/test_payment_razorpay.py -q`
  - `python3 -m compileall -q backend/app backend/tests`
  - `npm run lint` from `frontend`
  - `npm run build` from `frontend`

- [ ] Document unrelated pre-existing failures separately.

---

### Task 12: Supabase Dev/Staging Verification

**Files:**
- No code changes unless migration fails.

- [ ] Apply migration to Supabase development branch or staging project.

- [ ] Run Supabase security advisors.

- [ ] Smoke test:
  - login as tenant owner
  - login as tenant member
  - login as operator/system admin
  - list leads
  - open conversation
  - upload CSV
  - download CSV through signed URL
  - create/update template
  - send broadcast test
  - create/update automation
  - view call logs
  - update settings
  - perform operator feature/status change

- [ ] Confirm audit rows are created for sensitive actions.

---

### Task 13: Production Rollout

**Files:**
- No code changes.

- [ ] Take Supabase backup before production migration.

- [ ] Apply migration during low-traffic window.

- [ ] Run security advisors immediately after.

- [ ] Smoke test one real tenant.

- [ ] Keep rollback SQL ready:
  - disable newly added RLS policies/table RLS only if production access breaks
  - never re-enable public CSV bucket as long-term fix

---

## Acceptance Criteria

- Supabase advisor no longer reports tenant/client data tables as publicly exposed without RLS, or any remaining warnings are explicitly documented with a reason.
- `broadcast-csvs` is private and not publicly listable.
- Sensitive operator/settings actions create audit events.
- Existing app flows work after RLS in staging.
- Targeted backend tests pass.
- Frontend lint/build pass.

---

## Out Of Scope For This Slice

- Subscription billing and plan enforcement.
- Durable queue/worker migration.
- Full onboarding redesign.
- Legal documents and sales packaging.
