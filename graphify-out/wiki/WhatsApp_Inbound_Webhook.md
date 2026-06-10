# WhatsApp Inbound Webhook

> 15 nodes · cohesion 0.30

## Key Concepts

- **whatsapp_webhook()** (27 connections) — `backend/app/routes/webhook.py`
- **webhook.py** (11 connections) — `backend/app/routes/webhook.py`
- **str** (8 connections) — `backend/app/routes/webhook.py`
- **_handle_opt_out()** (6 connections) — `backend/app/routes/webhook.py`
- **_resolve_tenant_from_payload()** (5 connections) — `backend/app/routes/webhook.py`
- **_is_opt_out()** (4 connections) — `backend/app/routes/webhook.py`
- **_get_tenant_id_for_meta_number()** (4 connections) — `backend/app/routes/webhook.py`
- **_has_prior_inbound_in_broadcast()** (4 connections) — `backend/app/routes/webhook.py`
- **bool** (3 connections) — `backend/app/routes/webhook.py`
- **_get_tenant_id_for_twilio_number()** (3 connections) — `backend/app/routes/webhook.py`
- **verify_webhook()** (3 connections) — `backend/app/routes/webhook.py`
- **_record_per_broadcast_opt_out()** (3 connections) — `backend/app/routes/webhook.py`
- **Request** (2 connections) — `backend/app/routes/webhook.py`
- **BackgroundTasks** (1 connections) — `backend/app/routes/webhook.py`
- **Extract first phone_number_id from payload and look up its tenant.** (1 connections) — `backend/app/routes/webhook.py`

## Relationships

- [[Quality Failover]] (3 shared connections)
- [[Leads & Conversations API]] (2 shared connections)
- [[Telecaller Assignment Engine]] (2 shared connections)
- [[Booking Flow]] (2 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)
- [[Template Submission (Meta)]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)
- [[Telegram Channel]] (1 shared connections)
- [[Autopilot & AI Agent Runtime]] (1 shared connections)
- [[Flow Runtime (pause/resume)]] (1 shared connections)

## Source Files

- `backend/app/routes/webhook.py`

## Audit Trail

- EXTRACTED: 66 (78%)
- INFERRED: 19 (22%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*