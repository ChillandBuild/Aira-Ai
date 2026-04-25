# Exotel Voice Integration — Design Spec
**Date:** 2026-04-20  
**Scope:** Replace Twilio Voice with Exotel for the telecalling dialer. WhatsApp (Twilio) is unaffected.

---

## 1. Config & Environment

### Remove
- `TWILIO_VOICE_NUMBER` (env var + `config.py` field)

### Add to `backend/.env` and `backend/.env.example`
| Env Var | Description |
|---|---|
| `EXOTEL_SID` | Exotel account SID |
| `EXOTEL_API_KEY` | Exotel API key |
| `EXOTEL_API_TOKEN` | Exotel API token |
| `EXOTEL_VIRTUAL_NUMBER` | Exotel virtual number (e.g. `08068xxxxxx`) |
| `EXOTEL_SUBDOMAIN` | API subdomain (default: `api.exotel.com`) |

### Keep unchanged
`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER` — used for WhatsApp only.

---

## 2. Database Migration (`006_exotel.sql`)

```sql
ALTER TABLE call_logs RENAME COLUMN twilio_call_sid TO call_sid;
ALTER TABLE callers RENAME COLUMN phone_extension TO phone;
```

- `call_logs.call_sid` — stores Exotel's CallSid (provider-agnostic name)
- `callers.phone` — stores the telecaller's real mobile number (e.g. `+919345679286`)

Unique index on `call_sid` renamed accordingly.

---

## 3. Backend — `calls.py`

### `POST /api/v1/calls/initiate`
1. Validate Exotel config fields are set
2. Fetch lead's phone from DB
3. Fetch caller's phone from `callers.phone`
4. Insert `call_logs` row with `status = 'initiated'`
5. POST to Exotel:
   ```
   POST https://{EXOTEL_SUBDOMAIN}/v1/Accounts/{EXOTEL_SID}/Calls/connect
   Basic auth: (EXOTEL_API_KEY, EXOTEL_API_TOKEN)
   Form params:
     From        = caller.phone
     To          = lead.phone
     CallerId    = EXOTEL_VIRTUAL_NUMBER
     StatusCallback = {PUBLIC_BASE_URL}/api/v1/calls/voice-status?call_log_id={id}
     Record      = true
   ```
6. Store Exotel `CallSid` in `call_logs.call_sid`
7. Return `{ call_log_id, call_sid, status }`

### `POST /api/v1/calls/voice-status` (Exotel callback)
Exotel posts form fields: `CallSid`, `Status`, `Duration`, `RecordingUrl`

Status mapping:
| Exotel Status | Internal Status |
|---|---|
| `completed` | `completed` |
| `no-answer` | `no_answer` |
| `busy`, `failed` | `failed` |
| anything else | `in_progress` |

Recording: download from `RecordingUrl` (no auth needed for Exotel), upload to Supabase Storage bucket `call-recordings`.

### `PATCH /api/v1/calls/{call_log_id}/outcome`
No change — outcome/scoring logic is provider-agnostic.

---

## 4. Frontend — `telecalling/page.tsx`

Single change: update the `dial()` success alert from `twilio_call_sid` → `call_sid`.

---

## 5. Out of Scope
- Instagram integration (next phase)
- Celery re-engagement scheduler
- Browser softphone / WebRTC
