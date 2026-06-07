# RLS Storage Audit Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Aira AI's Supabase data layer safer for paying SaaS clients without breaking the current working product.

**Architecture:** Keep FastAPI as the trusted service-role boundary. Add RLS as defense in depth only after reconciling local and live schema state. Move broadcast CSV access from public URLs to backend-issued signed URLs before making storage private. Add app audit logs in a backward-compatible way so sensitive actions are recorded without blocking live operations if the audit table is temporarily unavailable.

**Tech Stack:** FastAPI, Supabase Postgres/Auth/Storage, Supabase SQL migrations, pytest, Next.js.

---

## Current Situation Snapshot

Checked on 2026-06-06 against the current repo and connected Supabase project.

- Current branch/worktree has unrelated user edits in:
  - `docs/superpowers/specs/2026-05-31-bot-flow-builder-design.md`
  - `docs/superpowers/specs/2026-05-31-bot-flow-builder-phase2-design.md`
- Recent commits added RAG knowledge, tag download fixes, broadcast attribution fixes, bot-flow work, opt-out handling, and dashboard changes.
- Local migrations now run through `087_knowledge_rag.sql`; the previous plan's `072_security_hardening.sql` filename is no longer safe because several `072_*` and later migrations already exist.
- Live Supabase project is `ayftynkgmfkaqmmnlmoc`, status `ACTIVE_HEALTHY`, Postgres `17.6.1.121`, region `ap-south-1`.
- Live migration history does not exactly match all local migration filenames. It includes later applied migrations such as `knowledge_rag`, but local files also include `082_booking_generic.sql`, `083_drop_hot_lead_alerts.sql`, `084_drop_twilio_message_sid.sql`, `085_opt_out_per_broadcast_and_tag.sql`, and `086_lead_tag_opt_outs_lead_fk.sql`. Do not assume local migration order equals production state.
- Local migration scan still shows no table RLS policies except storage policies in `036_broadcast_csvs_bucket.sql`.
- `broadcast-csvs` is still designed as a public bucket in migration `036_broadcast_csvs_bucket.sql`, and current upload flow still calls `get_public_url`.
- `operator.py` and `app_settings.py` still do not write first-party app audit logs.
- New active data surfaces since the older plan:
  - `tags.py`
  - `ctwa_leads.py`
  - `automation_flow_runs`
  - `broadcast_tags`
  - `lead_tag_interest`
  - `broadcast_lead_scores`
  - `lead_tag_opt_outs`
  - `knowledge_chunks`
  - bot-flow fields on `automations`, `automation_steps`, and `messages`

---

## Will This Affect The Working Stage?

Yes, if done carelessly. The work should be split so the live app keeps working.

**Safe to do without breaking current usage:**
- Add static tests.
- Add `audit_log.py` helper that never raises on insert failure.
- Wire audit calls if the helper swallows audit insert failures.
- Add an `app_audit_logs` table migration in staging/dev first.
- Add backend signed-URL endpoint while keeping existing public CSV URLs temporarily.
- Add function `search_path` fixes after verifying function signatures.

**Can affect the current working app if applied directly:**
- Enabling RLS on production tables without tested policies.
- Making `broadcast-csvs` private before the frontend uses signed download URLs.
- Removing public CSV URLs before old `broadcast_history` records are migrated or handled.
- Applying a migration written from local assumptions while production schema differs.
- Locking tables that frontend Supabase client reads directly, if any such direct reads still exist.

**Deployment rule:** this slice must be shipped in compatibility stages:

1. Add audit and signed URL code first.
2. Deploy code while storage remains public.
3. Backfill/normalize stored CSV object paths.
4. Make storage private and switch UI links to signed download endpoint.
5. Apply RLS only on Supabase dev/staging branch first.
6. Run smoke tests.
7. Apply to production during low-traffic window with rollback SQL ready.

---

## Required Preflight Before Any Migration

- [ ] Run `git status --short` and preserve unrelated user edits.
- [ ] Compare local migration files with live Supabase migration history.
- [ ] Confirm which local migrations are already represented under different live names.
- [ ] Produce a table inventory from the live database, not only local SQL files.
- [ ] Confirm whether frontend still uses Supabase client directly for any app data tables.
- [ ] Confirm current storage bucket public/private status for:
  - `broadcast-csvs`
  - `call-recordings`
  - any knowledge/document buckets if present
- [ ] Run Supabase security advisors if the tool is available in the session.
- [ ] Decide the final migration filename after live/local reconciliation. Based on current local files, use `089_security_hardening.sql` unless a newer migration appears first.

---

## Updated Table Policy Groups

**Tenant-owned tables with direct `tenant_id`:**
`leads`, `messages`, `call_logs`, `callers`, `phone_numbers`, `voice_numbers`, `app_settings`, `message_templates`, `bookings`, `lead_notes`, `lead_stage_events`, `follow_up_jobs`, `knowledge_documents`, `knowledge_chunks`, `chat_handovers`, `automations`, `automation_steps`, `automation_logs`, `automation_pending_executions`, `automation_flow_runs`, `broadcast_recipients`, `broadcast_failed_contacts`, `broadcast_tags`, `broadcast_lead_scores`, `lead_tag_interest`, `lead_tag_opt_outs`, `scheduled_broadcasts`, `caller_status_logs`, `caller_digests`, `whatsapp_insights_snapshots`, `incidents`, `ad_campaigns`, `ai_prompts`, `ai_tune_suggestions`, `lead_conversation_state`, `phone_number_quality_history`.

**Membership/core tenant tables:**
`tenants`, `tenant_users`.

**System-only tables:**
`system_admins`, `app_audit_logs` writes, future billing admin tables.

**Dropped or legacy tables:**
`faqs` and `hot_lead_alerts` are dropped locally in later migrations. Verify live state before including them in RLS SQL.

**Ambiguous/needs live confirmation:**
`conversations`, `employee_todos`, `meta_templates`, `bot_flows`. Add tenant policies only after confirming columns and active use. If unclear, lock them down and keep access through service role.

---

## Implementation Tasks

### Task 1: Add Current-State Static Security Tests

**Files:**
- Create: `backend/tests/test_rls_storage_audit_static.py`

- [ ] Test that the hardening migration filename is not `072_security_hardening.sql`.
- [ ] Test that the migration creates `app_audit_logs`.
- [ ] Test that the migration includes `alter table public.leads enable row level security`.
- [ ] Test that the migration includes new current tables: `automation_flow_runs`, `broadcast_tags`, `lead_tag_interest`, `broadcast_lead_scores`, `lead_tag_opt_outs`, `knowledge_chunks`.
- [ ] Test that storage migration sets `broadcast-csvs` public flag to false.
- [ ] Test that broad public read policy for `broadcast-csvs` is dropped.
- [ ] Test that `operator.py` imports and calls `record_audit_event`.
- [ ] Test that `app_settings.py` imports and calls `record_audit_event`.
- [ ] Test that `upload.py` has a signed CSV URL/download endpoint and no new `get_public_url` dependency for new uploads.

Run:

```bash
cd backend
PYTHONPATH=. ./.venv/bin/pytest tests/test_rls_storage_audit_static.py -q
```

Expected first run: fail until implementation exists.

---

### Task 2: Reconcile Live And Local Supabase Schema

**Files:**
- Create: `docs/superpowers/audits/2026-06-06-supabase-schema-reconciliation.md`

- [ ] Record live Supabase project id and migration list.
- [ ] Compare live migrations to local `backend/supabase/migrations`.
- [ ] List local migrations not visible by name in live migration history.
- [ ] For each mismatch, decide whether it is:
  - applied under a batched/different live migration name
  - local-only and not yet deployed
  - obsolete
- [ ] Confirm the actual live table list before writing final RLS SQL.
- [ ] Confirm extension status. Current live check shows `vector` installed in `public`, which remains a Supabase advisor concern and should be documented.

Do not proceed to production RLS until this document exists.

---

### Task 3: Add Audit Log Table Migration

**Files:**
- Create: `backend/supabase/migrations/089_security_hardening.sql`

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
  - `app_audit_logs_tenant_created_idx`
  - `app_audit_logs_actor_created_idx`
  - `app_audit_logs_action_created_idx`

- [ ] Enable RLS on `app_audit_logs`.

- [ ] Add read policy:
  - tenant owners can read logs for their own tenant
  - system admins can read all logs

- [ ] Do not add authenticated insert/update/delete policies. Backend service role inserts logs.

---

### Task 4: Add Backend Audit Helper

**Files:**
- Create: `backend/app/services/audit_log.py`

- [ ] Implement:

```python
def record_audit_event(
    db,
    *,
    tenant_id: str | None,
    actor_user_id: str | None,
    actor_role: str | None,
    action: str,
    target_type: str,
    target_id: str | None = None,
    metadata: dict | None = None,
) -> None:
    ...
```

- [ ] Helper behavior:
  - recursively masks metadata keys containing `password`, `token`, `secret`, `key`, `credential`
  - inserts into `app_audit_logs`
  - catches and logs exceptions
  - never blocks the main request

Verification:

```bash
python3 -m compileall -q backend/app backend/tests
```

---

### Task 5: Wire Operator Audit Events

**Files:**
- Modify: `backend/app/routes/operator.py`

- [ ] Add audit events for:
  - `operator.client_created`
  - `operator.features_updated`
  - `operator.status_updated`
  - `operator.leads_wiped`
  - `operator.password_reset`

- [ ] Include safe metadata:
  - target tenant id
  - service tier
  - enabled feature list
  - old/new status if fetched cheaply
  - deleted lead count

- [ ] Do not store plaintext temporary password in audit metadata.

- [ ] Consider a follow-up UX task: reset password endpoint should ideally return one-time setup flow rather than plaintext temp password.

---

### Task 6: Wire Settings Audit Events

**Files:**
- Modify: `backend/app/routes/app_settings.py`

- [ ] Add audit event after settings update:
  - `settings.updated`

- [ ] Metadata:
  - updated key names
  - secret key names only, never secret values
  - generated Telegram webhook secret should be recorded as key updated, not value

- [ ] Add audit event after channel activation:
  - `settings.channel_activated`

---

### Task 7: Add Signed CSV Access Before Making Storage Private

**Files:**
- Modify: `backend/app/routes/upload.py`
- Modify: `frontend/app/dashboard/upload/page.tsx`

- [ ] Change new upload storage metadata to preserve object path, for example:
  - `csv_file_path = "{tenant_id}/{broadcast_id_or_uuid}_{filename}"`
  - keep `csv_file_url` temporarily for old records during compatibility window

- [ ] Add backend endpoint:
  - `GET /api/v1/upload/csv-signed-url?path=...`
  - verifies path starts with `{tenant_id}/`
  - creates short-lived signed URL from `broadcast-csvs`
  - returns `{ "url": signed_url, "expires_in": 300 }`

- [ ] Update frontend CSV links to call signed URL endpoint before opening.

- [ ] Update code that downloads the original CSV for adding `broadcast_id`:
  - prefer storage path + signed URL
  - keep fallback for old `csv_file_url`

Compatibility rule: deploy this before making bucket private.

---

### Task 8: Private Broadcast CSV Storage Migration

**Files:**
- Modify: `backend/supabase/migrations/089_security_hardening.sql`

- [ ] Set bucket private:

```sql
update storage.buckets
set public = false
where id = 'broadcast-csvs';
```

- [ ] Drop broad public read policy:

```sql
drop policy if exists "Allow public read access to CSVs" on storage.objects;
```

- [ ] Replace broad upload/delete policies with tenant-folder scoped authenticated policies only if direct client storage access is required.

- [ ] If all storage access goes through FastAPI service role, avoid broad authenticated storage policies and keep user access through backend signed URLs.

---

### Task 9: RLS Helper Functions

**Files:**
- Modify: `backend/supabase/migrations/089_security_hardening.sql`

- [ ] Add `public.is_tenant_member(p_tenant_id uuid)`.
- [ ] Add `public.is_tenant_owner(p_tenant_id uuid)`.
- [ ] Add `public.is_system_admin()`.
- [ ] Set each function:
  - `security definer`
  - `stable`
  - `set search_path = public, pg_temp`

These helpers should read only `tenant_users` and `system_admins`.

---

### Task 10: RLS Policies For Current Tenant Tables

**Files:**
- Modify: `backend/supabase/migrations/089_security_hardening.sql`

- [ ] Enable RLS on all confirmed tenant-owned tables.
- [ ] For tables read by authenticated frontend/API clients, add select policy:

```sql
using (public.is_tenant_member(tenant_id))
```

- [ ] Add owner-only write policies only where direct authenticated client writes are actually needed.
- [ ] Prefer backend service-role writes for sensitive tables:
  - `messages`
  - `call_logs`
  - `broadcast_recipients`
  - `automation_logs`
  - `automation_flow_runs`
  - `knowledge_chunks`
  - `whatsapp_insights_snapshots`

- [ ] Include current new tables:
  - `automation_flow_runs`
  - `broadcast_tags`
  - `lead_tag_interest`
  - `broadcast_lead_scores`
  - `lead_tag_opt_outs`
  - `knowledge_chunks`

- [ ] Exclude dropped tables unless live schema still has them:
  - `faqs`
  - `hot_lead_alerts`

---

### Task 11: RLS Policies For Tenant/Core/System Tables

**Files:**
- Modify: `backend/supabase/migrations/089_security_hardening.sql`

- [ ] `tenants`:
  - tenant members can select their own tenant
  - no authenticated public update unless app requires it

- [ ] `tenant_users`:
  - tenant owners can read users in their tenant
  - users can read their own membership
  - writes remain backend/operator-controlled

- [ ] `system_admins`:
  - system admins can read their own admin status
  - no anon access
  - no authenticated write access

- [ ] `app_audit_logs`:
  - tenant owners can read tenant logs
  - system admins can read all logs
  - no authenticated writes

---

### Task 12: Function Search Path Fixes

**Files:**
- Modify: `backend/supabase/migrations/089_security_hardening.sql`

- [ ] Fix previously advisor-flagged functions if they still exist:
  - `update_updated_at`
  - `generate_booking_ref`
  - `increment_phone_daily_send_count`
  - `get_conversation_leads`
  - `update_updated_at_column`
  - `toggle_lead_pin`
  - `increment_lead_no_reply_count`

- [ ] Include newer functions if present:
  - `bump_automation_step_counter`
  - `insert_knowledge_chunk`
  - `match_knowledge_chunks`

Use exact function signatures from live DB before writing `alter function`.

---

### Task 13: Local Verification

Run:

```bash
cd backend
PYTHONPATH=. ./.venv/bin/pytest tests/test_rls_storage_audit_static.py tests/test_security_hardening_static.py tests/test_payment_razorpay.py -q
python3 -m compileall -q app tests
```

Then from `frontend`:

```bash
npm run lint
npm run build
```

Document any pre-existing unrelated failures separately.

---

### Task 14: Staging/Supabase Branch Verification

- [ ] Apply migration to a Supabase development branch or staging project first.
- [ ] Run security advisors.
- [ ] Smoke test:
  - tenant owner login
  - tenant member/caller login
  - system operator login
  - dashboard load
  - lead list and lead detail
  - conversations
  - upload CSV
  - signed CSV open/download
  - failed CSV download
  - broadcast send/schedule/drip
  - tag stats
  - CTWA leads page
  - knowledge document upload/reindex
  - bot-flow create/edit/run
  - automation logs
  - call logs
  - booking flow
  - settings update
  - operator feature/status/wipe/reset actions

- [ ] Confirm audit rows are created for sensitive actions.
- [ ] Confirm old broadcast history entries with legacy `csv_file_url` still behave or degrade cleanly.

---

### Task 15: Production Rollout

- [ ] Back up Supabase production before migration.
- [ ] Deploy backend/frontend compatibility changes first.
- [ ] Verify signed CSV endpoint works in production while bucket is still public.
- [ ] Apply storage-private + RLS migration during low traffic.
- [ ] Run Supabase advisors after migration.
- [ ] Smoke test one real tenant and one operator account.
- [ ] Keep rollback ready:
  - disable RLS table-by-table only if access breaks
  - do not restore public CSV listing as the long-term fix

---

## Acceptance Criteria

- Migration filename/order reflects the current repo state.
- Live/local schema reconciliation is documented.
- `broadcast-csvs` is private after code supports signed URL access.
- No broad public storage listing policy remains for CSVs.
- `app_audit_logs` exists and receives operator/settings events.
- Tenant-owned active tables have RLS enabled with tested policies.
- Dropped/local-only tables are not blindly referenced in production SQL.
- Existing app flows work in staging before production rollout.
- Targeted backend tests pass.
- Frontend lint/build pass.

---

## Out Of Scope For This Slice

- Subscription billing and plan enforcement.
- Durable queue/worker migration.
- Full onboarding redesign.
- Legal documents and sales packaging.
