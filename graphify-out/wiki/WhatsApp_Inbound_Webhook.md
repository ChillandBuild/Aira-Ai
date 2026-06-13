# WhatsApp Inbound Webhook

> 33 nodes · cohesion 0.12

## Key Concepts

- **whatsapp_webhook()** (26 connections) — `backend/app/routes/webhook.py`
- **webhook.py** (12 connections) — `backend/app/routes/webhook.py`
- **str** (8 connections) — `backend/app/routes/webhook.py`
- **send_migration_notice()** (8 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/failover.py`
- **_is_transient_delivery_error()** (7 connections) — `backend/app/routes/webhook.py`
- **_resolve_tenant_from_payload()** (7 connections) — `backend/app/routes/webhook.py`
- **handle_quality_red()** (7 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/failover.py`
- **update_number_quality()** (7 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/failover.py`
- **_handle_opt_out()** (6 connections) — `backend/app/routes/webhook.py`
- **handle_quality_yellow()** (5 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/failover.py`
- **test_delivery_error_classification.py** (5 connections) — `backend/tests/test_delivery_error_classification.py`
- **_is_opt_out()** (4 connections) — `backend/app/routes/webhook.py`
- **bool** (4 connections) — `backend/app/routes/webhook.py`
- **_get_tenant_id_for_meta_number()** (4 connections) — `backend/app/routes/webhook.py`
- **_has_prior_inbound_in_broadcast()** (4 connections) — `backend/app/routes/webhook.py`
- **failover.py** (4 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/failover.py`
- **str** (4 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/failover.py`
- **str** (4 connections) — `backend/app/services/failover.py`
- **_record_per_broadcast_opt_out()** (3 connections) — `backend/app/routes/webhook.py`
- **verify_webhook()** (3 connections) — `backend/app/routes/webhook.py`
- **_get_tenant_id_for_twilio_number()** (3 connections) — `backend/app/routes/webhook.py`
- **Request** (2 connections) — `backend/app/routes/webhook.py`
- **int** (2 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/failover.py`
- **test_known_transient_codes_are_transient()** (2 connections) — `backend/tests/test_delivery_error_classification.py`
- **test_transient_code_as_string_is_transient()** (2 connections) — `backend/tests/test_delivery_error_classification.py`
- *... and 8 more nodes in this community*

## Relationships

- [[Callers CRUD & Coaching]] (5 shared connections)
- [[Meta Cloud API Client]] (2 shared connections)
- [[Assignment Service]] (2 shared connections)
- [[Tests: Booking Flow]] (2 shared connections)
- [[Growth Service]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Meta Cloud Service]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)
- [[Notify Service]] (1 shared connections)

## Source Files

- `/Users/prem/Documents/Aira Ai/backend/app/services/failover.py`
- `backend/app/routes/webhook.py`
- `backend/app/services/failover.py`
- `backend/tests/test_delivery_error_classification.py`

## Audit Trail

- EXTRACTED: 120 (78%)
- INFERRED: 34 (22%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*