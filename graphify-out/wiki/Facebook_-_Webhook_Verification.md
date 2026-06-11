# Facebook / Webhook Verification

> 16 nodes · cohesion 0.17

## Key Concepts

- **facebook_webhook()** (19 connections) — `backend/app/routes/facebook.py`
- **verify_meta_signature()** (7 connections) — `backend/app/services/meta_webhook_verify.py`
- **facebook.py** (5 connections) — `backend/app/routes/facebook.py`
- **verify_facebook_webhook()** (5 connections) — `backend/app/routes/facebook.py`
- **test_facebook.py** (4 connections) — `backend/tests/test_facebook.py`
- **resolve_tenant_for_page()** (3 connections) — `backend/app/services/meta_webhook_verify.py`
- **test_facebook_webhook_ignores_echo()** (3 connections) — `backend/tests/test_facebook.py`
- **str** (2 connections) — `backend/app/routes/facebook.py`
- **Request** (2 connections) — `backend/app/routes/facebook.py`
- **str** (2 connections) — `backend/app/services/meta_webhook_verify.py`
- **test_verify_facebook_webhook_success()** (2 connections) — `backend/tests/test_facebook.py`
- **test_facebook_webhook_new_lead()** (2 connections) — `backend/tests/test_facebook.py`
- **BackgroundTasks** (1 connections) — `backend/app/routes/facebook.py`
- **bytes** (1 connections) — `backend/app/services/meta_webhook_verify.py`
- **bool** (1 connections) — `backend/app/services/meta_webhook_verify.py`
- **Echo messages (is_echo=True) should be silently skipped.** (1 connections) — `backend/tests/test_facebook.py`

## Relationships

- [[Instagram Channel]] (3 shared connections)
- [[Templates API]] (3 shared connections)
- [[App Entry & Schedulers]] (2 shared connections)
- [[Leads API]] (2 shared connections)
- [[Telecaller Assignment Engine]] (2 shared connections)
- [[Booking Flow]] (2 shared connections)
- [[Telegram Channel]] (1 shared connections)
- [[Autopilot & AI Agent Runtime]] (1 shared connections)
- [[Flow Runtime (pause/resume)]] (1 shared connections)
- [[Follow-ups & Callback Scheduling API]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)

## Source Files

- `backend/app/routes/facebook.py`
- `backend/app/services/meta_webhook_verify.py`
- `backend/tests/test_facebook.py`

## Audit Trail

- EXTRACTED: 35 (58%)
- INFERRED: 25 (42%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*