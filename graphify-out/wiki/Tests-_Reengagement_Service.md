# Tests: Reengagement Service

> 66 nodes · cohesion 0.05

## Key Concepts

- **create_payment_link()** (15 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/payment_razorpay.py`
- **RuntimeError** (13 connections)
- **verify_webhook_signature()** (12 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/payment_razorpay.py`
- **initiate_click2call()** (12 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/telecmi_client.py`
- **test_reengagement_service.py** (11 connections) — `backend/tests/test_reengagement_service.py`
- **_lead()** (10 connections) — `backend/tests/test_reengagement_service.py`
- **_make_db()** (9 connections) — `backend/tests/test_reengagement_service.py`
- **test_notify_service.py** (8 connections) — `backend/tests/test_notify_service.py`
- **_step()** (8 connections) — `backend/tests/test_reengagement_service.py`
- **_make_db()** (7 connections) — `backend/tests/test_notify_service.py`
- **payment_razorpay.py** (6 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/payment_razorpay.py`
- **_get_key_id()** (6 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/payment_razorpay.py`
- **_get_key_secret()** (6 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/payment_razorpay.py`
- **_get_webhook_secret()** (6 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/payment_razorpay.py`
- **str** (5 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/payment_razorpay.py`
- **_normalize_phone()** (5 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/telecmi_client.py`
- **test_freeform_window_closed_fallback_send_fails_logs_failed()** (5 connections) — `backend/tests/test_reengagement_service.py`
- **test_undeliverable_lead_is_skipped_no_send_no_log()** (5 connections) — `backend/tests/test_reengagement_service.py`
- **test_opted_out_lead_is_skipped_no_send_no_log()** (5 connections) — `backend/tests/test_reengagement_service.py`
- **str** (5 connections) — `backend/app/services/payment_razorpay.py`
- **test_payment_razorpay.py** (4 connections) — `/Users/prem/Documents/Aira Ai/backend/tests/test_payment_razorpay.py`
- **_now_iso()** (4 connections) — `backend/tests/test_reengagement_service.py`
- **test_freeform_window_open_sends_freeform()** (4 connections) — `backend/tests/test_reengagement_service.py`
- **test_freeform_window_closed_with_fallback_sends_template()** (4 connections) — `backend/tests/test_reengagement_service.py`
- **test_freeform_window_closed_no_fallback_skips()** (4 connections) — `backend/tests/test_reengagement_service.py`
- *... and 41 more nodes in this community*

## Relationships

- [[AI Reply Pipeline (Groq)]] (3 shared connections)
- [[Meta Cloud Service]] (3 shared connections)
- [[Broadcast Executor & Outbound Router]] (1 shared connections)
- [[Knowledge Base (pgvector RAG)]] (1 shared connections)
- [[Reengagement Service]] (1 shared connections)
- [[Booking Flow]] (1 shared connections)

## Source Files

- `/Users/prem/Documents/Aira Ai/backend/app/services/payment_razorpay.py`
- `/Users/prem/Documents/Aira Ai/backend/app/services/telecmi_client.py`
- `/Users/prem/Documents/Aira Ai/backend/tests/test_payment_razorpay.py`
- `backend/app/services/payment_razorpay.py`
- `backend/app/services/telecmi_client.py`
- `backend/tests/test_notify_service.py`
- `backend/tests/test_reengagement_service.py`

## Audit Trail

- EXTRACTED: 211 (87%)
- INFERRED: 32 (13%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*