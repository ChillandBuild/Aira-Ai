# Tests: Booking Flow

> 21 nodes · cohesion 0.18

## Key Concepts

- **route_booking_intent()** (19 connections) — `backend/app/services/booking_flow.py`
- **get_or_create_state()** (16 connections) — `backend/app/services/booking_flow.py`
- **test_booking_flow.py** (11 connections) — `backend/tests/test_booking_flow.py`
- **_make_db()** (9 connections) — `backend/tests/test_booking_flow.py`
- **detect_booking_intent()** (6 connections) — `backend/app/services/booking_flow.py`
- **bool** (4 connections) — `backend/app/services/booking_flow.py`
- **_is_booking_question()** (4 connections) — `backend/app/services/booking_flow.py`
- **test_get_or_create_state_existing()** (3 connections) — `backend/tests/test_booking_flow.py`
- **test_get_or_create_state_new()** (3 connections) — `backend/tests/test_booking_flow.py`
- **test_advance_state_name_to_rasi()** (3 connections) — `backend/tests/test_booking_flow.py`
- **test_advance_state_address_triggers_payment()** (3 connections) — `backend/tests/test_booking_flow.py`
- **test_route_booking_intent_question_returns_false()** (3 connections) — `backend/tests/test_booking_flow.py`
- **test_route_booking_intent_rejection_returns_false()** (3 connections) — `backend/tests/test_booking_flow.py`
- **test_route_booking_intent_invalid_input_llm_returns_false()** (3 connections) — `backend/tests/test_booking_flow.py`
- **test_route_booking_intent_valid_input_llm_returns_true()** (3 connections) — `backend/tests/test_booking_flow.py`
- **test_detect_booking_intent_positive()** (2 connections) — `backend/tests/test_booking_flow.py`
- **test_detect_booking_intent_negative()** (2 connections) — `backend/tests/test_booking_flow.py`
- **Webhook-level routing for the 5-step booking state machine.      Returns True if** (1 connections) — `backend/app/services/booking_flow.py`
- **Fetch the conversation state for a lead, or return a fresh idle state.      Uses** (1 connections) — `backend/app/services/booking_flow.py`
- **Webhook-level routing for the 5-step booking state machine.      Returns True if** (1 connections) — `backend/app/services/booking_flow.py`
- **Fetch the conversation state for a lead, or return a fresh idle state.      Uses** (1 connections) — `backend/app/services/booking_flow.py`

## Relationships

- [[Booking Flow]] (16 shared connections)
- [[Facebook / Webhook Verification]] (2 shared connections)
- [[Instagram Channel]] (2 shared connections)
- [[Assignment Service]] (2 shared connections)
- [[WhatsApp Inbound Webhook]] (2 shared connections)
- [[Meta Cloud Service]] (1 shared connections)
- [[Callers CRUD & Coaching]] (1 shared connections)

## Source Files

- `backend/app/services/booking_flow.py`
- `backend/tests/test_booking_flow.py`

## Audit Trail

- EXTRACTED: 72 (71%)
- INFERRED: 29 (29%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*