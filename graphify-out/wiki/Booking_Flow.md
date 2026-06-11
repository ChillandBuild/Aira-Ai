# Booking Flow

> 26 nodes · cohesion 0.21

## Key Concepts

- **send_whatsapp()** (21 connections) — `backend/app/services/ai_reply.py`
- **booking_flow.py** (18 connections) — `backend/app/services/booking_flow.py`
- **str** (16 connections) — `backend/app/services/booking_flow.py`
- **route_booking_intent()** (16 connections) — `backend/app/services/booking_flow.py`
- **get_or_create_state()** (14 connections) — `backend/app/services/booking_flow.py`
- **advance_state()** (11 connections) — `backend/app/services/booking_flow.py`
- **start_booking_flow()** (9 connections) — `backend/app/services/booking_flow.py`
- **_send_payment_link()** (8 connections) — `backend/app/services/booking_flow.py`
- **_create_draft_booking()** (7 connections) — `backend/app/services/booking_flow.py`
- **_get_booking_settings()** (6 connections) — `backend/app/services/booking_flow.py`
- **_generate_booking_ref()** (5 connections) — `backend/app/services/booking_flow.py`
- **detect_booking_intent()** (5 connections) — `backend/app/services/booking_flow.py`
- **_get_step_prompt()** (5 connections) — `backend/app/services/booking_flow.py`
- **_validate_collect_input()** (5 connections) — `backend/app/services/booking_flow.py`
- **bool** (4 connections) — `backend/app/services/booking_flow.py`
- **_upsert_state()** (4 connections) — `backend/app/services/booking_flow.py`
- **confirm_booking()** (4 connections) — `backend/app/services/booking_flow.py`
- **_is_booking_question()** (4 connections) — `backend/app/services/booking_flow.py`
- **get_pending_step_prompt()** (4 connections) — `backend/app/services/booking_flow.py`
- **_get_next_step()** (3 connections) — `backend/app/services/booking_flow.py`
- **_get_groq_client()** (2 connections) — `backend/app/services/booking_flow.py`
- **Send a WhatsApp message via Meta Cloud API. Returns message ID or None on failur** (1 connections) — `backend/app/services/ai_reply.py`
- **Webhook-level routing for the 5-step booking state machine.      Returns True if** (1 connections) — `backend/app/services/booking_flow.py`
- **Fetch the conversation state for a lead, or return a fresh idle state.      Uses** (1 connections) — `backend/app/services/booking_flow.py`
- **Mark booking confirmed. Returns (phone, booking_ref, devotee_name, tenant_id) or** (1 connections) — `backend/app/services/booking_flow.py`
- *... and 1 more nodes in this community*

## Relationships

- [[AI Reply Pipeline (Groq)]] (7 shared connections)
- [[Leads API]] (6 shared connections)
- [[Tests: Booking Flow]] (6 shared connections)
- [[Bot Flow / Automation Engine]] (5 shared connections)
- [[Templates API]] (2 shared connections)
- [[Facebook / Webhook Verification]] (2 shared connections)
- [[Instagram Channel]] (2 shared connections)
- [[Telegram Channel]] (2 shared connections)
- [[WhatsApp Inbound Webhook]] (2 shared connections)
- [[Follow-ups & Callback Scheduling API]] (1 shared connections)
- [[Segments API]] (1 shared connections)
- [[CSV Upload & Bulk Send]] (1 shared connections)

## Source Files

- `backend/app/services/ai_reply.py`
- `backend/app/services/booking_flow.py`

## Audit Trail

- EXTRACTED: 137 (78%)
- INFERRED: 39 (22%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*