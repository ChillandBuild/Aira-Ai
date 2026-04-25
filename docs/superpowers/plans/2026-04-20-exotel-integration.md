# Exotel Voice Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Twilio Voice with Exotel for the telecalling dialer, keeping WhatsApp (Twilio) unchanged.

**Architecture:** Exotel's click-to-call API is called via `httpx` from the existing `/api/v1/calls/initiate` endpoint. Exotel rings the agent's mobile first, then bridges to the lead. Status callbacks reuse the existing `/voice-status` webhook with updated field names. The DB column `twilio_call_sid` is renamed to `call_sid` and `callers.phone_extension` to `callers.phone`.

**Tech Stack:** FastAPI, httpx (already installed), Supabase PostgreSQL, Next.js 14, TypeScript

---

## File Map

| File | Change |
|---|---|
| `backend/supabase/migrations/006_exotel.sql` | CREATE — rename DB columns |
| `backend/app/config.py` | MODIFY — swap Twilio voice for Exotel settings |
| `backend/.env.example` | MODIFY — update env var documentation |
| `backend/app/routes/calls.py` | MODIFY — replace TwilioClient with Exotel httpx |
| `backend/app/routes/system.py` | MODIFY — replace `twilio_voice_number` with `exotel_virtual_number` |
| `frontend/lib/api.ts` | MODIFY — update types and response field names |
| `frontend/app/dashboard/telecalling/page.tsx` | MODIFY — `phone_extension` → `phone`, `twilio_call_sid` → `call_sid` |

---

## Task 1: DB Migration

**Files:**
- Create: `backend/supabase/migrations/006_exotel.sql`

> No automated tests for migrations. Verify manually in Supabase SQL editor after running.

- [ ] **Step 1: Create the migration file**

```sql
-- backend/supabase/migrations/006_exotel.sql
alter table call_logs rename column twilio_call_sid to call_sid;
alter table callers rename column phone_extension to phone;
```

- [ ] **Step 2: Run the migration in Supabase**

Open your Supabase project → SQL Editor → paste and run the file contents.

Expected: no errors. Verify with:
```sql
select column_name from information_schema.columns
where table_name = 'call_logs' and column_name = 'call_sid';
-- should return 1 row

select column_name from information_schema.columns
where table_name = 'callers' and column_name = 'phone';
-- should return 1 row
```

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/migrations/006_exotel.sql
git commit -m "feat: rename twilio_call_sid→call_sid and phone_extension→phone"
```

---

## Task 2: Config & Env

**Files:**
- Modify: `backend/app/config.py`
- Modify: `backend/.env.example`

- [ ] **Step 1: Update `config.py`**

Replace the entire file contents:

```python
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_key: str
    gemini_api_key: str
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_whatsapp_number: str = "whatsapp:+14155238886"
    exotel_sid: str | None = None
    exotel_api_key: str | None = None
    exotel_api_token: str | None = None
    exotel_virtual_number: str | None = None
    exotel_subdomain: str = "api.exotel.com"
    public_base_url: str | None = None
    meta_page_token: str | None = None
    meta_verify_token: str | None = None
    meta_ig_user_id: str | None = None

    model_config = {"env_file": ".env", "case_sensitive": False}


settings = Settings()
```

- [ ] **Step 2: Update `.env.example`**

Replace the entire file contents:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-supabase-service-key
GEMINI_API_KEY=your-gemini-api-key
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
EXOTEL_SID=your-exotel-account-sid
EXOTEL_API_KEY=your-exotel-api-key
EXOTEL_API_TOKEN=your-exotel-api-token
EXOTEL_VIRTUAL_NUMBER=08068xxxxxx
EXOTEL_SUBDOMAIN=api.exotel.com
PUBLIC_BASE_URL=https://your-ngrok-subdomain.ngrok-free.dev
META_PAGE_TOKEN=your-meta-page-token
META_VERIFY_TOKEN=your-meta-verify-token
META_IG_USER_ID=your-instagram-business-user-id
```

- [ ] **Step 3: Add Exotel values to your real `backend/.env`**

Add these four lines (fill in your actual values from Exotel dashboard):
```
EXOTEL_SID=your-actual-sid
EXOTEL_API_KEY=your-actual-api-key
EXOTEL_API_TOKEN=your-actual-api-token
EXOTEL_VIRTUAL_NUMBER=your-virtual-number
EXOTEL_SUBDOMAIN=api.exotel.com
```

Remove this line from `.env`:
```
TWILIO_VOICE_NUMBER=...
```

- [ ] **Step 4: Verify config loads**

```bash
cd backend
python -c "from app.config import settings; print(settings.exotel_sid, settings.exotel_virtual_number)"
```
Expected: prints your Exotel SID and virtual number (not `None`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/config.py backend/.env.example
git commit -m "feat: add Exotel config, remove twilio_voice_number"
```

---

## Task 3: Backend — Replace Twilio with Exotel in `calls.py`

**Files:**
- Modify: `backend/app/routes/calls.py`

- [ ] **Step 1: Replace the entire file**

```python
import logging
from typing import Literal
from uuid import UUID
import httpx
from fastapi import APIRouter, Form, HTTPException, Response
from pydantic import BaseModel
from app.config import settings
from app.db.supabase import get_supabase
from app.services.call_scorer import score_from_outcome, recompute_caller_score

logger = logging.getLogger(__name__)
router = APIRouter()

Outcome = Literal["converted", "callback", "not_interested", "no_answer"]


class InitiateCall(BaseModel):
    lead_id: UUID
    caller_id: UUID | None = None


class OutcomeUpdate(BaseModel):
    outcome: Outcome


@router.post("/initiate")
async def initiate_call(payload: InitiateCall):
    if not all([settings.exotel_sid, settings.exotel_api_key,
                settings.exotel_api_token, settings.exotel_virtual_number]):
        raise HTTPException(status_code=400, detail="Exotel credentials not configured")
    if not settings.public_base_url:
        raise HTTPException(status_code=400, detail="PUBLIC_BASE_URL not configured")

    db = get_supabase()

    lead = db.table("leads").select("phone").eq("id", str(payload.lead_id)).maybe_single().execute()
    if not lead.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead_phone = lead.data["phone"]

    caller_phone: str | None = None
    if payload.caller_id:
        caller = db.table("callers").select("phone").eq("id", str(payload.caller_id)).maybe_single().execute()
        if caller.data:
            caller_phone = caller.data.get("phone")

    if not caller_phone:
        raise HTTPException(status_code=400, detail="Caller has no phone number configured")

    log_insert = db.table("call_logs").insert({
        "lead_id": str(payload.lead_id),
        "caller_id": str(payload.caller_id) if payload.caller_id else None,
        "status": "initiated",
    }).execute()
    call_log_id = log_insert.data[0]["id"]

    status_cb = f"{settings.public_base_url.rstrip('/')}/api/v1/calls/voice-status?call_log_id={call_log_id}"
    url = f"https://{settings.exotel_subdomain}/v1/Accounts/{settings.exotel_sid}/Calls/connect"

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                auth=(settings.exotel_api_key, settings.exotel_api_token),
                data={
                    "From": caller_phone,
                    "To": lead_phone,
                    "CallerId": settings.exotel_virtual_number,
                    "StatusCallback": status_cb,
                    "StatusCallbackEvents[0]": "terminal",
                    "Record": "true",
                },
            )
            resp.raise_for_status()
            result = resp.json()
    except httpx.HTTPStatusError as e:
        logger.error(f"Exotel call failed: {e.response.text}")
        db.table("call_logs").update({"status": "failed"}).eq("id", call_log_id).execute()
        raise HTTPException(status_code=502, detail=f"Exotel call failed: {e.response.text}")
    except Exception as e:
        logger.error(f"Exotel call error: {e}")
        db.table("call_logs").update({"status": "failed"}).eq("id", call_log_id).execute()
        raise HTTPException(status_code=502, detail=f"Exotel call error: {e}")

    call_sid = result.get("Call", {}).get("Sid", "")
    db.table("call_logs").update({"call_sid": call_sid}).eq("id", call_log_id).execute()
    return {"call_log_id": call_log_id, "call_sid": call_sid, "status": result.get("Call", {}).get("Status", "queued")}


@router.post("/voice-status")
async def exotel_voice_status(
    call_log_id: str,
    CallSid: str | None = Form(None),
    Status: str | None = Form(None),
    Duration: str | None = Form(None),
    RecordingUrl: str | None = Form(None),
):
    db = get_supabase()
    updates: dict = {}

    if Status == "completed":
        updates["status"] = "completed"
    elif Status == "no-answer":
        updates["status"] = "no_answer"
        updates["outcome"] = "no_answer"
    elif Status in ("busy", "failed", "canceled"):
        updates["status"] = "failed"
    else:
        updates["status"] = "in_progress"

    if Duration:
        try:
            updates["duration_seconds"] = int(Duration)
        except ValueError:
            pass

    if RecordingUrl:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(RecordingUrl)
                resp.raise_for_status()
                audio_bytes = resp.content
            storage_path = f"{call_log_id}.mp3"
            db.storage.from_("call-recordings").upload(
                storage_path,
                audio_bytes,
                {"content-type": "audio/mpeg", "upsert": "true"},
            )
            public_url = db.storage.from_("call-recordings").get_public_url(storage_path)
            updates["recording_url"] = public_url
        except Exception as e:
            logger.error(f"Recording upload failed for {call_log_id}: {e}")

    if updates:
        db.table("call_logs").update(updates).eq("id", call_log_id).execute()

    if updates.get("status") in ("completed", "no_answer"):
        log_row = (
            db.table("call_logs")
            .select("caller_id,outcome,duration_seconds")
            .eq("id", call_log_id)
            .maybe_single()
            .execute()
        )
        row = log_row.data or {}
        score = score_from_outcome(row.get("outcome"), row.get("duration_seconds"))
        db.table("call_logs").update({"score": score}).eq("id", call_log_id).execute()
        if row.get("caller_id"):
            recompute_caller_score(row["caller_id"], db)

    return Response(content="", media_type="text/xml")


@router.patch("/{call_log_id}/outcome")
async def set_outcome(call_log_id: str, payload: OutcomeUpdate):
    db = get_supabase()
    log = (
        db.table("call_logs")
        .select("caller_id,duration_seconds")
        .eq("id", call_log_id)
        .maybe_single()
        .execute()
    )
    if not log.data:
        raise HTTPException(status_code=404, detail="Call log not found")

    score = score_from_outcome(payload.outcome, log.data.get("duration_seconds"))
    db.table("call_logs").update({
        "outcome": payload.outcome,
        "score": score,
    }).eq("id", call_log_id).execute()

    new_caller_score = None
    if log.data.get("caller_id"):
        new_caller_score = recompute_caller_score(log.data["caller_id"], db)

    return {
        "call_log_id": call_log_id,
        "outcome": payload.outcome,
        "score": score,
        "caller_overall_score": new_caller_score,
    }
```

- [ ] **Step 2: Verify import — Twilio SDK no longer imported**

```bash
grep -n "twilio" backend/app/routes/calls.py
```
Expected: no output (zero matches).

- [ ] **Step 3: Start backend and check it loads**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
```
Expected: server starts with no `ImportError` or config errors. Hit Ctrl+C after confirming.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/calls.py
git commit -m "feat: replace Twilio voice with Exotel click-to-call"
```

---

## Task 4: Update `system.py`

**Files:**
- Modify: `backend/app/routes/system.py`

- [ ] **Step 1: Replace `twilio_voice_number` with `exotel_virtual_number`**

In `backend/app/routes/system.py`, change the return dict:

Old line:
```python
        "twilio_voice_number": settings.twilio_voice_number or None,
```

New line:
```python
        "exotel_virtual_number": settings.exotel_virtual_number or None,
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/routes/system.py
git commit -m "chore: replace twilio_voice_number with exotel_virtual_number in status"
```

---

## Task 5: Frontend — `api.ts` types

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Update `Caller` interface** — `phone_extension` → `phone`

Old:
```typescript
export interface Caller {
  id: string;
  name: string;
  phone_extension: string | null;
  overall_score: number;
  active: boolean;
}
```

New:
```typescript
export interface Caller {
  id: string;
  name: string;
  phone: string | null;
  overall_score: number;
  active: boolean;
}
```

- [ ] **Step 2: Update `SystemStatus` interface** — `twilio_voice_number` → `exotel_virtual_number`

Old:
```typescript
export interface SystemStatus {
  twilio_number: string | null;
  twilio_voice_number: string | null;
  has_meta: boolean;
  has_gemini: boolean;
  supabase_url: string;
  active_prompt: { name: string; updated_at: string } | null;
  active_faq_count: number;
}
```

New:
```typescript
export interface SystemStatus {
  twilio_number: string | null;
  exotel_virtual_number: string | null;
  has_meta: boolean;
  has_gemini: boolean;
  supabase_url: string;
  active_prompt: { name: string; updated_at: string } | null;
  active_faq_count: number;
}
```

- [ ] **Step 3: Update `calls.initiate` return type** — `twilio_call_sid` → `call_sid`

Old:
```typescript
    initiate: (leadId: string, callerId?: string) =>
      apiFetch<{ call_log_id: string; twilio_call_sid: string; status: string }>(
```

New:
```typescript
    initiate: (leadId: string, callerId?: string) =>
      apiFetch<{ call_log_id: string; call_sid: string; status: string }>(
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "chore: update frontend types for Exotel (call_sid, phone, exotel_virtual_number)"
```

---

## Task 6: Frontend — `telecalling/page.tsx`

**Files:**
- Modify: `frontend/app/dashboard/telecalling/page.tsx`

- [ ] **Step 1: Update caller phone display** — `phone_extension` → `phone`

Old (line ~99):
```tsx
                      <p className="font-label text-xs text-on-surface-muted">
                        {caller.phone_extension ?? "—"}
                      </p>
```

New:
```tsx
                      <p className="font-label text-xs text-on-surface-muted">
                        {caller.phone ?? "—"}
                      </p>
```

- [ ] **Step 2: Update dial() success alert** — `twilio_call_sid` → `call_sid`

Old (line ~57):
```typescript
      alert(`Call initiated (${res.status}). SID ${res.twilio_call_sid}`);
```

New:
```typescript
      alert(`Call initiated (${res.status}). SID ${res.call_sid}`);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/dashboard/telecalling/page.tsx
git commit -m "chore: update telecalling page for Exotel field names"
```

---

## Task 7: End-to-End Smoke Test

- [ ] **Step 1: Start backend**

```bash
cd backend && uvicorn app.main:app --reload --port 8000
```

- [ ] **Step 2: Start frontend**

```bash
cd frontend && npm run dev
```

- [ ] **Step 3: Expose webhook via ngrok**

```bash
ngrok http 8000
```
Copy the ngrok URL and set `PUBLIC_BASE_URL=https://xxx.ngrok-free.app` in `backend/.env`.

- [ ] **Step 4: Add your number as a test caller in Supabase**

In Supabase SQL editor:
```sql
insert into callers (name, phone, active)
values ('Test Caller', '+919345679286', true);
```

- [ ] **Step 5: Open telecalling dashboard**

Navigate to `http://localhost:3000/dashboard/telecalling`.
- Confirm your caller appears with phone `+919345679286`
- Confirm a Segment A lead appears in the queue

- [ ] **Step 6: Initiate a test call**

Click "Call" on a lead. Your mobile (`+919345679286`) should ring within ~5 seconds. Pick up and confirm the lead's phone is called next.

- [ ] **Step 7: Check Supabase call_logs**

```sql
select id, call_sid, status, duration_seconds from call_logs order by created_at desc limit 1;
```
Expected: a row with a non-null `call_sid` and `status = 'completed'` (after you hang up).
