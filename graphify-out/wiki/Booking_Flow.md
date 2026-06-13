# Booking Flow

> 19 nodes · cohesion 0.29

## Key Concepts

- **send_whatsapp()** (22 connections) — `backend/app/services/ai_reply.py`
- **booking_flow.py** (19 connections) — `backend/app/services/booking_flow.py`
- **str** (17 connections) — `backend/app/services/booking_flow.py`
- **advance_state()** (12 connections) — `backend/app/services/booking_flow.py`
- **start_booking_flow()** (9 connections) — `backend/app/services/booking_flow.py`
- **_send_payment_link()** (9 connections) — `backend/app/services/booking_flow.py`
- **send_whatsapp_text()** (8 connections) — `backend/app/services/booking_flow.py`
- **_create_draft_booking()** (6 connections) — `backend/app/services/booking_flow.py`
- **_get_booking_settings()** (5 connections) — `backend/app/services/booking_flow.py`
- **_validate_collect_input()** (5 connections) — `backend/app/services/booking_flow.py`
- **_get_step_prompt()** (5 connections) — `backend/app/services/booking_flow.py`
- **_generate_booking_ref()** (4 connections) — `backend/app/services/booking_flow.py`
- **_upsert_state()** (4 connections) — `backend/app/services/booking_flow.py`
- **get_pending_step_prompt()** (4 connections) — `backend/app/services/booking_flow.py`
- **_get_next_step()** (3 connections) — `backend/app/services/booking_flow.py`
- **_get_groq_client()** (2 connections) — `backend/app/services/booking_flow.py`
- **Send a WhatsApp message via Meta Cloud API. Returns message ID or None on failur** (1 connections) — `backend/app/services/ai_reply.py`
- **Return the prompt for the current collection step, or None if not mid-flow.** (1 connections) — `backend/app/services/booking_flow.py`
- **Send a WhatsApp message via Meta Cloud API. Returns message ID or None on failur** (1 connections) — `backend/app/services/ai_reply.py`

## Relationships

- [[Tests: Booking Flow]] (16 shared connections)
- [[Callers CRUD & Coaching]] (4 shared connections)
- [[AI Reply Pipeline (Groq)]] (4 shared connections)
- [[Ai Reply Service]] (2 shared connections)
- [[Leads API]] (1 shared connections)
- [[Segments API]] (1 shared connections)
- [[Upload API]] (1 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)
- [[Reengagement Service]] (1 shared connections)
- [[Meta Cloud Service]] (1 shared connections)
- [[Tests: Reengagement Service]] (1 shared connections)

## Source Files

- `backend/app/services/ai_reply.py`
- `backend/app/services/booking_flow.py`

## Audit Trail

- EXTRACTED: 117 (85%)
- INFERRED: 20 (15%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*