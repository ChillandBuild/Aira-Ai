# Production SaaS Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert Aira AI from a managed beta into a production-ready SaaS foundation by hardening tenant isolation, webhook trust, private data storage, auditability, and deployment checks.

**Architecture:** Keep the backend as the trusted server-side boundary, but remove trust gaps by making every service-key database operation tenant-scoped, every public provider callback authenticated, and every sensitive operator/client action auditable. Supabase RLS is introduced through a reviewed migration with explicit policies, not an immediate live toggle that could break production access.

**Tech Stack:** FastAPI, Supabase Postgres/Auth/Storage, Next.js, pytest, Supabase migrations, Render/Vercel deployment.

---

## File Structure

- `backend/app/routes/webhook.py`: WhatsApp webhook signature and default-tenant fallback hardening.
- `backend/app/routes/upload.py`: tenant-scope campaign lead lookup and validate drip send time.
- `backend/app/routes/calls.py`: tenant-scope user call APIs, tenant-aware TeleCMI settings, webhook shared-secret guard.
- `backend/app/services/voice_router.py`: tenant-aware voice number routing.
- `backend/app/services/payment_razorpay.py`: tenant-aware Razorpay credentials and idempotency key.
- `backend/app/routes/bookings.py`: pass tenant id into payment service before payment link creation.
- `backend/app/services/audit_log.py`: append-only application audit log helper.
- `backend/app/routes/operator.py`, `backend/app/routes/app_settings.py`: record audit events for destructive or sensitive changes.
- `backend/supabase/migrations/072_security_hardening.sql`: audit log table, storage policy hardening, RLS enablement/policies where safe.
- `backend/tests/test_security_hardening_static.py`: static regression tests for the high-risk patterns.
- `backend/tests/test_payment_razorpay.py`: update payment service tests for tenant-aware credentials/idempotency.

---

### Task 1: Static Regression Tests For Known Security Bugs

**Files:**
- Create: `backend/tests/test_security_hardening_static.py`

- [ ] **Step 1: Write failing tests**

```python
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def test_whatsapp_webhook_requires_meta_signature_header():
    source = read("app/routes/webhook.py")
    assert 'if not signature:' in source
    assert 'missing signature' in source.lower()


def test_whatsapp_webhook_does_not_fallback_to_default_tenant_for_meta_messages():
    source = read("app/routes/webhook.py")
    assert 'using default' not in source[source.index('elif field == "messages"'):source.index('return {"status": "ok"}')]


def test_upload_campaign_lookup_is_tenant_scoped():
    source = read("app/routes/upload.py")
    assert '.select("id").eq("phone", phone).eq("tenant_id", tenant_id).limit(1)' in source


def test_voice_router_requires_tenant_id():
    source = read("app/services/voice_router.py")
    assert "async def get_best_voice_number(tenant_id: str)" in source
    assert '.eq("tenant_id", tenant_id)' in source


def test_call_delete_is_tenant_scoped():
    source = read("app/routes/calls.py")
    assert 'async def delete_call_log(call_log_id: str, ctx: dict = Depends(get_tenant_and_role))' in source
    assert '.eq("tenant_id", ctx["tenant_id"])' in source
```

- [ ] **Step 2: Verify red**

Run: `./.venv/bin/pytest tests/test_security_hardening_static.py -q`

Expected: failures for missing signature guard, missing tenant filters, and non-tenant-aware voice routing.

- [ ] **Step 3: Implement only the minimal code needed for Task 1 tests**

Modify `backend/app/routes/webhook.py` so JSON WhatsApp callbacks return `200 OK` without processing when `x-hub-signature-256` is absent. Remove default tenant fallback from Meta message processing; unknown phone-number ids should log and skip.

Modify `backend/app/routes/upload.py` so campaign message lead lookup includes `.eq("tenant_id", tenant_id)`.

Modify `backend/app/services/voice_router.py` so `get_best_voice_number` accepts `tenant_id: str` and filters `voice_numbers` by tenant.

Modify `backend/app/routes/calls.py` so call initiation passes tenant id into voice routing and user-facing call APIs scope updates/deletes by tenant id.

- [ ] **Step 4: Verify green**

Run: `./.venv/bin/pytest tests/test_security_hardening_static.py -q`

Expected: all tests pass.

---

### Task 2: Provider Webhook Trust Boundaries

**Files:**
- Modify: `backend/app/routes/webhook.py`
- Modify: `backend/app/routes/calls.py`
- Modify: `backend/app/config_dynamic.py`
- Test: `backend/tests/test_security_hardening_static.py`

- [ ] **Step 1: Add failing static checks**

Add checks that TeleCMI CDR and live event handlers require an `x-aira-webhook-secret` header and compare it to tenant/global `telecmi_webhook_secret`.

- [ ] **Step 2: Verify red**

Run: `./.venv/bin/pytest tests/test_security_hardening_static.py -q`

Expected: TeleCMI secret checks fail before implementation.

- [ ] **Step 3: Implement shared-secret verification**

Add `telecmi_webhook_secret` to `_ENV_MAP`. For public TeleCMI routes, read `x-aira-webhook-secret`, compare with `get_setting("telecmi_webhook_secret")`, and return `403` before parsing or mutating data when missing/invalid.

- [ ] **Step 4: Verify green**

Run: `./.venv/bin/pytest tests/test_security_hardening_static.py -q`

Expected: all tests pass.

---

### Task 3: Tenant-Aware Razorpay And Idempotency

**Files:**
- Modify: `backend/app/services/payment_razorpay.py`
- Modify: `backend/app/services/booking_flow.py`
- Modify: `backend/tests/test_payment_razorpay.py`

- [ ] **Step 1: Write failing payment tests**

Add tests that `create_payment_link(..., tenant_id="tenant-1")` calls `get_setting("razorpay_key_id", tenant_id="tenant-1")`, `get_setting("razorpay_key_secret", tenant_id="tenant-1")`, and sends an `X-Razorpay-Idempotency-Key` header based on `booking_id`.

- [ ] **Step 2: Verify red**

Run: `./.venv/bin/pytest tests/test_payment_razorpay.py -q`

Expected: failures because current service has no tenant parameter and no idempotency header.

- [ ] **Step 3: Implement tenant/idempotency support**

Update `_get_key_id`, `_get_key_secret`, and `_get_webhook_secret` to accept `tenant_id: str | None`. Update `create_payment_link` to require or accept tenant id and pass idempotency header:

```python
headers={"X-Razorpay-Idempotency-Key": f"booking:{booking_id}:payment_link"}
```

Update booking flow call sites to pass the booking tenant id.

- [ ] **Step 4: Verify green**

Run: `./.venv/bin/pytest tests/test_payment_razorpay.py -q`

Expected: all payment tests pass.

---

### Task 4: Application Audit Log Foundation

**Files:**
- Create: `backend/app/services/audit_log.py`
- Modify: `backend/app/routes/operator.py`
- Modify: `backend/app/routes/app_settings.py`
- Create/modify migration: `backend/supabase/migrations/072_security_hardening.sql`

- [ ] **Step 1: Add audit table migration**

Create `app_audit_logs` with columns: `id`, `tenant_id`, `actor_user_id`, `actor_role`, `action`, `target_type`, `target_id`, `metadata jsonb`, `created_at`.

- [ ] **Step 2: Add helper**

Implement `record_audit_event(db, tenant_id, actor_user_id, actor_role, action, target_type, target_id=None, metadata=None)` that inserts into `app_audit_logs` and logs but does not crash the main request if audit insert fails.

- [ ] **Step 3: Wire sensitive events**

Record audit events for operator client creation, feature update, status update, wipe leads, reset password, and settings update.

- [ ] **Step 4: Verify**

Run: `python3 -m compileall -q backend/app backend/tests`

Expected: exit code 0.

---

### Task 5: Supabase Storage And RLS Migration Draft

**Files:**
- Create/modify: `backend/supabase/migrations/072_security_hardening.sql`

- [ ] **Step 1: Storage policy hardening**

Make `broadcast-csvs` private and replace broad public `storage.objects` select policy with tenant-folder scoped authenticated policies.

- [ ] **Step 2: RLS draft**

Enable RLS for tenant-owned app tables and add policies based on membership in `tenant_users`. Keep system/admin tables locked to service-role-only unless a specific authenticated policy is required.

- [ ] **Step 3: Function search path**

Alter flagged functions to `SET search_path = public, pg_temp`.

- [ ] **Step 4: Live review before apply**

Run Supabase advisors after applying to a staging/dev branch first. Do not apply this migration directly to production until the app has been tested with authenticated users.

---

### Task 6: Verification Suite

**Files:**
- No new files.

- [ ] **Step 1: Backend targeted tests**

Run: `./.venv/bin/pytest tests/test_security_hardening_static.py tests/test_payment_razorpay.py -q`

Expected: all targeted tests pass.

- [ ] **Step 2: Backend full tests**

Run: `./.venv/bin/pytest tests -q`

Expected: all backend tests pass or report unrelated pre-existing failures explicitly.

- [ ] **Step 3: Backend compile**

Run: `python3 -m compileall -q backend/app backend/tests`

Expected: exit code 0.

- [ ] **Step 4: Frontend checks**

Run: `npm run lint` and `npm run build` from `frontend`.

Expected: both commands exit 0.

---

## Self-Review

- Spec coverage: covers immediate security blockers from the audit: RLS, webhook trust, tenant scoping, private storage, payment tenancy, audit logging, and verification.
- Placeholder scan: no task uses TBD/TODO as implementation content.
- Scope check: durable queues, billing plans, and full onboarding remain separate Phase 2/3 plans because they are independent subsystems.
