# Guru Peyarchi Homam — V2 Full Booking Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automate the complete Homam booking flow over WhatsApp — guided data collection (name, rasi, nakshatram, gotram, address), Razorpay payment link generation, and auto-confirmation on payment — with zero telecaller intervention required.

**Architecture:** A conversational state machine stored in Supabase intercepts inbound messages for leads in an active booking flow before reaching the existing AI reply pipeline. When a lead expresses booking intent, the webhook triggers the state machine which steps through data collection, generates a Razorpay payment link, and marks the booking confirmed via a Razorpay webhook. The existing lead scoring and telecaller escalation still runs in parallel for leads that abandon the flow.

**Tech Stack:** FastAPI, Supabase (PostgreSQL), Razorpay Payment Links API, Meta Cloud API (send_text_message), Groq LLM (intent classification), Next.js 14, shadcn/ui.

**Prerequisite:** V1 plan must be complete (opt_in_source fixed, template approved, FAQs loaded).

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `backend/supabase/migrations/028_bookings.sql` | Create | `bookings` table — one row per booking attempt |
| `backend/supabase/migrations/029_conversation_state.sql` | Create | `lead_conversation_state` table — tracks booking flow step per lead |
| `backend/app/services/booking_flow.py` | Create | State machine: step transitions, data collection, payment link send |
| `backend/app/services/payment_razorpay.py` | Create | Razorpay Payment Links API — create link, verify webhook signature |
| `backend/app/routes/bookings.py` | Create | REST: list/get bookings, Razorpay payment webhook (no auth) |
| `backend/app/routes/webhook.py` | Modify | Intercept inbound messages for leads in active booking flow |
| `backend/app/main.py` | Modify | Register bookings router |
| `backend/tests/test_booking_flow.py` | Create | Unit tests for state machine transitions |
| `backend/tests/test_payment_razorpay.py` | Create | Unit tests for payment link creation and webhook verification |
| `frontend/app/dashboard/bookings/page.tsx` | Create | Admin bookings list page |
| `frontend/app/dashboard/bookings/components/BookingTable.tsx` | Create | Table component for bookings |
| `frontend/app/dashboard/bookings/components/BookingStatusBadge.tsx` | Create | Status chip component |
| `frontend/app/dashboard/layout.tsx` (or sidebar component) | Modify | Add Bookings nav item |

---

## Task 1: Bookings table migration

**Files:**
- Create: `backend/supabase/migrations/028_bookings.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 028_bookings.sql
-- One booking record per lead per event attempt.
-- Booking moves: draft → pending_payment → confirmed → cancelled

CREATE TABLE IF NOT EXISTS bookings (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid        NOT NULL,
  lead_id        uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_name     text        NOT NULL DEFAULT 'Guru Peyarchi Homam',
  devotee_name   text,
  rasi           text,
  nakshatram     text,
  gotram         text,
  delivery_address text,
  booking_ref    text        UNIQUE,
  status         text        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_payment', 'confirmed', 'cancelled')),
  payment_link   text,
  razorpay_payment_id text,
  amount_paise   integer,
  paid_at        timestamptz,
  confirmed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_lead_id_idx   ON bookings (lead_id, tenant_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx    ON bookings (status, tenant_id);
CREATE INDEX IF NOT EXISTS bookings_booking_ref_idx ON bookings (booking_ref);

-- Generate a short human-readable reference like GPH-2026-0001
CREATE SEQUENCE IF NOT EXISTS booking_ref_seq START 1;

CREATE OR REPLACE FUNCTION generate_booking_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.booking_ref := 'GPH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('booking_ref_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_booking_ref
  BEFORE INSERT ON bookings
  FOR EACH ROW
  WHEN (NEW.booking_ref IS NULL)
  EXECUTE FUNCTION generate_booking_ref();
```

- [ ] **Step 2: Apply migration in Supabase**

Paste into Supabase SQL editor and run. Verify:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'bookings'
ORDER BY ordinal_position;
```

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/migrations/028_bookings.sql
git commit -m "feat: add bookings table with auto-generated reference"
```

---

## Task 2: Conversation state table migration

**Files:**
- Create: `backend/supabase/migrations/029_conversation_state.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 029_conversation_state.sql
-- One row per lead. Tracks current step in an active booking flow.
-- State machine states: idle | collecting_name | collecting_rasi |
--   collecting_nakshatram | collecting_gotram | collecting_address | awaiting_payment

CREATE TABLE IF NOT EXISTS lead_conversation_state (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id     uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL,
  flow_name   text        NOT NULL DEFAULT 'booking',
  state       text        NOT NULL DEFAULT 'idle',
  draft_data  jsonb       NOT NULL DEFAULT '{}',
  booking_id  uuid        REFERENCES bookings(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_conversation_state_lead_unique UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS conv_state_lead_idx ON lead_conversation_state (lead_id);
```

- [ ] **Step 2: Apply and verify**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'lead_conversation_state';
```

- [ ] **Step 3: Commit**

```bash
git add backend/supabase/migrations/029_conversation_state.sql
git commit -m "feat: add lead_conversation_state table for booking flow"
```

---

## Task 3: Razorpay payment service

**Files:**
- Create: `backend/app/services/payment_razorpay.py`
- Create: `backend/tests/test_payment_razorpay.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_payment_razorpay.py
import pytest
import hashlib
import hmac
import json
from unittest.mock import patch, AsyncMock, MagicMock


# --- Test: payment link creation ---

@pytest.mark.asyncio
async def test_create_payment_link_returns_url():
    """create_payment_link returns the short_url from Razorpay."""
    from app.services.payment_razorpay import create_payment_link

    mock_response = MagicMock()
    mock_response.is_success = True
    mock_response.json.return_value = {
        "id": "plink_abc123",
        "short_url": "https://rzp.io/l/abc123",
        "status": "created",
    }

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(return_value=mock_response)

        result = await create_payment_link(
            booking_id="booking-uuid-1",
            booking_ref="GPH-2026-0001",
            amount_paise=50000,  # ₹500
            customer_name="Rajan Kumar",
            customer_phone="+919876543210",
            description="Guru Peyarchi Homam - Rajan Kumar",
        )

    assert result["payment_link_url"] == "https://rzp.io/l/abc123"
    assert result["razorpay_payment_link_id"] == "plink_abc123"


@pytest.mark.asyncio
async def test_create_payment_link_raises_on_failure():
    """create_payment_link raises RuntimeError when Razorpay returns non-2xx."""
    from app.services.payment_razorpay import create_payment_link

    mock_response = MagicMock()
    mock_response.is_success = False
    mock_response.status_code = 400
    mock_response.text = '{"error": {"description": "Invalid amount"}}'

    with patch("httpx.AsyncClient") as MockClient:
        instance = MockClient.return_value.__aenter__.return_value
        instance.post = AsyncMock(return_value=mock_response)

        with pytest.raises(RuntimeError, match="Razorpay"):
            await create_payment_link(
                booking_id="booking-uuid-1",
                booking_ref="GPH-2026-0001",
                amount_paise=0,
                customer_name="Test",
                customer_phone="+919876543210",
                description="Test",
            )


# --- Test: webhook signature verification ---

def test_verify_razorpay_signature_valid():
    """verify_webhook_signature returns True for a valid signature."""
    from app.services.payment_razorpay import verify_webhook_signature

    secret = "test_webhook_secret"
    body = b'{"event": "payment_link.paid"}'
    expected_sig = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()

    with patch("app.services.payment_razorpay._get_webhook_secret", return_value=secret):
        assert verify_webhook_signature(body, expected_sig) is True


def test_verify_razorpay_signature_invalid():
    """verify_webhook_signature returns False for a tampered payload."""
    from app.services.payment_razorpay import verify_webhook_signature

    secret = "test_webhook_secret"
    body = b'{"event": "payment_link.paid"}'
    wrong_sig = "abc123deadbeef"

    with patch("app.services.payment_razorpay._get_webhook_secret", return_value=secret):
        assert verify_webhook_signature(body, wrong_sig) is False
```

- [ ] **Step 2: Run tests — expect FAIL (module doesn't exist yet)**

```bash
cd backend
pytest tests/test_payment_razorpay.py -v
```

Expected: `ModuleNotFoundError` or `ImportError`.

- [ ] **Step 3: Implement the payment service**

```python
# backend/app/services/payment_razorpay.py
import hashlib
import hmac
import logging
from typing import Any

import httpx

from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)

_RAZORPAY_BASE = "https://api.razorpay.com/v1"


def _get_key_id() -> str:
    v = get_setting("razorpay_key_id")
    if not v:
        raise RuntimeError("razorpay_key_id not configured in app settings")
    return v


def _get_key_secret() -> str:
    v = get_setting("razorpay_key_secret")
    if not v:
        raise RuntimeError("razorpay_key_secret not configured in app settings")
    return v


def _get_webhook_secret() -> str:
    v = get_setting("razorpay_webhook_secret")
    if not v:
        raise RuntimeError("razorpay_webhook_secret not configured in app settings")
    return v


async def create_payment_link(
    booking_id: str,
    booking_ref: str,
    amount_paise: int,
    customer_name: str,
    customer_phone: str,
    description: str,
) -> dict[str, Any]:
    """
    Create a Razorpay Payment Link and return the short URL.

    Returns dict with keys:
      - payment_link_url: str (e.g. https://rzp.io/l/abc123)
      - razorpay_payment_link_id: str
    """
    key_id = _get_key_id()
    key_secret = _get_key_secret()

    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "description": description,
        "customer": {
            "name": customer_name,
            "contact": customer_phone,
        },
        "notify": {"sms": False, "email": False},
        "reminder_enable": False,
        "notes": {
            "booking_id": booking_id,
            "booking_ref": booking_ref,
        },
        "callback_url": "",
        "callback_method": "get",
    }

    async with httpx.AsyncClient(auth=(key_id, key_secret), timeout=15.0) as client:
        resp = await client.post(f"{_RAZORPAY_BASE}/payment_links", json=payload)

    if not resp.is_success:
        raise RuntimeError(
            f"Razorpay payment link creation failed: {resp.status_code} {resp.text}"
        )

    data = resp.json()
    return {
        "payment_link_url": data["short_url"],
        "razorpay_payment_link_id": data["id"],
    }


def verify_webhook_signature(raw_body: bytes, received_signature: str) -> bool:
    """Verify Razorpay webhook payload using HMAC-SHA256."""
    try:
        secret = _get_webhook_secret()
        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, received_signature)
    except Exception as e:
        logger.error(f"Signature verification error: {e}")
        return False
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pytest tests/test_payment_razorpay.py -v
```

Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/payment_razorpay.py backend/tests/test_payment_razorpay.py
git commit -m "feat: add Razorpay payment link service with webhook verification"
```

---

## Task 4: Booking state machine service

**Files:**
- Create: `backend/app/services/booking_flow.py`
- Create: `backend/tests/test_booking_flow.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_booking_flow.py
import pytest
from unittest.mock import MagicMock, AsyncMock, patch


def _make_db(state_row: dict | None = None, booking_row: dict | None = None):
    """Build a mock Supabase client for common booking flow queries."""
    db = MagicMock()

    # lead_conversation_state queries
    state_chain = MagicMock()
    state_chain.execute.return_value.data = [state_row] if state_row else None
    state_chain.maybe_single.return_value.execute.return_value.data = state_row

    # bookings queries
    booking_chain = MagicMock()
    booking_chain.execute.return_value.data = [booking_row] if booking_row else [{"id": "booking-1", "booking_ref": "GPH-2026-0001"}]
    booking_chain.maybe_single.return_value.execute.return_value.data = booking_row

    def table_selector(name):
        t = MagicMock()
        t.select.return_value = state_chain if "state" in name else booking_chain
        t.insert.return_value.execute.return_value.data = [{"id": "new-id", "booking_ref": "GPH-2026-0001"}]
        t.update.return_value.eq.return_value.execute.return_value.data = []
        t.upsert.return_value.execute.return_value.data = []
        return t

    db.table.side_effect = table_selector
    return db


# --- Test: detect_booking_intent ---

@pytest.mark.asyncio
async def test_detect_booking_intent_yes():
    from app.services.booking_flow import detect_booking_intent
    assert await detect_booking_intent("YES") is True
    assert await detect_booking_intent("yes please") is True
    assert await detect_booking_intent("BOOK") is True
    assert await detect_booking_intent("i want to book") is True
    assert await detect_booking_intent("interested") is True


@pytest.mark.asyncio
async def test_detect_booking_intent_no():
    from app.services.booking_flow import detect_booking_intent
    assert await detect_booking_intent("what is the cost?") is False
    assert await detect_booking_intent("STOP") is False
    assert await detect_booking_intent("tell me more") is False


# --- Test: get_or_create_state ---

def test_get_or_create_state_returns_existing():
    from app.services.booking_flow import get_or_create_state
    existing = {
        "id": "state-1", "lead_id": "lead-1", "state": "collecting_rasi",
        "draft_data": {"devotee_name": "Rajan"}, "booking_id": "booking-1", "tenant_id": "tenant-1",
    }
    db = _make_db(state_row=existing)
    result = get_or_create_state("lead-1", "tenant-1", db)
    assert result["state"] == "collecting_rasi"
    assert result["draft_data"]["devotee_name"] == "Rajan"


# --- Test: advance_state ---

@pytest.mark.asyncio
async def test_advance_state_collecting_name():
    """When state=collecting_name and message contains a name, advances to collecting_rasi."""
    from app.services.booking_flow import advance_state

    state = {
        "id": "state-1", "lead_id": "lead-1", "state": "collecting_name",
        "draft_data": {}, "booking_id": "booking-1", "tenant_id": "tenant-1",
    }
    db = _make_db(state_row=state)

    with patch("app.services.booking_flow.send_whatsapp_text", new_callable=AsyncMock) as mock_send:
        await advance_state(
            state=state,
            message="My name is Rajan Kumar",
            phone="+919876543210",
            db=db,
        )
        # Should send the next question
        mock_send.assert_called_once()
        sent_text = mock_send.call_args[1]["text"]
        assert "rasi" in sent_text.lower() or "zodiac" in sent_text.lower()


@pytest.mark.asyncio
async def test_advance_state_collecting_address_triggers_payment():
    """When state=collecting_address, collecting the address should trigger payment link."""
    from app.services.booking_flow import advance_state

    state = {
        "id": "state-1", "lead_id": "lead-1", "state": "collecting_address",
        "draft_data": {
            "devotee_name": "Rajan Kumar",
            "rasi": "Mesham",
            "nakshatram": "Ashwini",
            "gotram": "Bharadwaja",
        },
        "booking_id": "booking-1",
        "tenant_id": "tenant-1",
    }
    db = _make_db(
        state_row=state,
        booking_row={"id": "booking-1", "booking_ref": "GPH-2026-0001", "amount_paise": 50000},
    )

    with patch("app.services.booking_flow.send_whatsapp_text", new_callable=AsyncMock) as mock_send, \
         patch("app.services.booking_flow.create_payment_link", new_callable=AsyncMock) as mock_pay:

        mock_pay.return_value = {
            "payment_link_url": "https://rzp.io/l/test",
            "razorpay_payment_link_id": "plink_test",
        }

        await advance_state(
            state=state,
            message="123, Anna Nagar, Chennai 600040",
            phone="+919876543210",
            db=db,
        )

        # Payment link should have been created
        mock_pay.assert_called_once()
        # WhatsApp should have been sent with the payment link
        sent_text = mock_send.call_args[1]["text"]
        assert "rzp.io" in sent_text or "payment" in sent_text.lower()
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
pytest tests/test_booking_flow.py -v
```

Expected: `ImportError` — `booking_flow` module doesn't exist.

- [ ] **Step 3: Implement the state machine**

```python
# backend/app/services/booking_flow.py
import logging
from typing import Any

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

# Ordered list of steps and their prompts
_FLOW_STEPS = [
    ("collecting_name",        "🙏 Wonderful! Please share the *full name* as it should appear in the booking."),
    ("collecting_rasi",        "Thank you! Please share your *Rasi* (zodiac sign) — e.g. Mesham, Rishabam, Mithunam..."),
    ("collecting_nakshatram",  "Please share your *Nakshatram* (birth star) — e.g. Ashwini, Bharani, Karthigai..."),
    ("collecting_gotram",      "Please share your *Gotram* (lineage/clan name). If unknown, reply 'Not known'."),
    ("collecting_address",     "Please share your *full delivery address* for prasadam — include street, city, state, and PIN code."),
]

_STATE_TO_FIELD = {
    "collecting_name":       "devotee_name",
    "collecting_rasi":       "rasi",
    "collecting_nakshatram": "nakshatram",
    "collecting_gotram":     "gotram",
    "collecting_address":    "delivery_address",
}

_INTENT_KEYWORDS = frozenset({
    "yes", "book", "booking", "yes please", "i want", "interested",
    "confirm", "register", "enroll", "proceed", "ok", "okay", "sure",
    "ஆமாம்", "வேணும்", "புக்",  # Tamil keywords
})

# Booking amount in paise (₹500 = 50000 paise). Update as needed.
BOOKING_AMOUNT_PAISE = 50000


async def detect_booking_intent(message: str) -> bool:
    """Return True if the message signals intent to book."""
    text = message.strip().lower()
    if any(kw in text for kw in _INTENT_KEYWORDS):
        return True
    return False


def get_or_create_state(lead_id: str, tenant_id: str, db=None) -> dict:
    """Fetch existing conversation state or return a fresh idle state (not persisted)."""
    db = db or get_supabase()
    row = (
        db.table("lead_conversation_state")
        .select("*")
        .eq("lead_id", lead_id)
        .maybe_single()
        .execute()
    )
    if row.data:
        return row.data
    return {
        "id": None,
        "lead_id": lead_id,
        "tenant_id": tenant_id,
        "flow_name": "booking",
        "state": "idle",
        "draft_data": {},
        "booking_id": None,
    }


def _upsert_state(state: dict, db) -> None:
    """Persist state row to Supabase."""
    if state.get("id"):
        db.table("lead_conversation_state").update({
            "state": state["state"],
            "draft_data": state["draft_data"],
            "booking_id": state.get("booking_id"),
            "updated_at": "now()",
        }).eq("id", state["id"]).execute()
    else:
        result = db.table("lead_conversation_state").insert({
            "lead_id": state["lead_id"],
            "tenant_id": state["tenant_id"],
            "flow_name": state["flow_name"],
            "state": state["state"],
            "draft_data": state["draft_data"],
            "booking_id": state.get("booking_id"),
        }).execute()
        if result.data:
            state["id"] = result.data[0]["id"]


def _get_next_step(current_state: str) -> str | None:
    """Return the next state name after current_state, or None if flow is complete."""
    states = [s for s, _ in _FLOW_STEPS]
    try:
        idx = states.index(current_state)
        return states[idx + 1] if idx + 1 < len(states) else None
    except ValueError:
        return None


def _get_step_prompt(state_name: str) -> str:
    for s, prompt in _FLOW_STEPS:
        if s == state_name:
            return prompt
    return ""


async def send_whatsapp_text(phone: str, text: str) -> None:
    from app.services.ai_reply import send_whatsapp
    await send_whatsapp(phone, text)


def _create_draft_booking(lead_id: str, tenant_id: str, db) -> dict:
    """Insert a draft booking row and return it."""
    result = db.table("bookings").insert({
        "lead_id": lead_id,
        "tenant_id": tenant_id,
        "event_name": "Guru Peyarchi Homam",
        "status": "draft",
        "amount_paise": BOOKING_AMOUNT_PAISE,
    }).execute()
    return result.data[0]


async def start_booking_flow(lead_id: str, tenant_id: str, phone: str, db=None) -> None:
    """Initiate a fresh booking flow for a lead."""
    db = db or get_supabase()
    booking = _create_draft_booking(lead_id, tenant_id, db)
    state = {
        "id": None,
        "lead_id": lead_id,
        "tenant_id": tenant_id,
        "flow_name": "booking",
        "state": "collecting_name",
        "draft_data": {},
        "booking_id": booking["id"],
    }
    _upsert_state(state, db)
    first_prompt = _get_step_prompt("collecting_name")
    await send_whatsapp_text(phone=phone, text=first_prompt)
    logger.info(f"Booking flow started for lead {lead_id}, booking {booking['id']}")


async def advance_state(state: dict, message: str, phone: str, db=None) -> None:
    """
    Process an inbound message for a lead in an active booking flow.
    Updates draft_data, advances state, sends the next prompt or payment link.
    """
    db = db or get_supabase()
    current = state["state"]

    if current == "idle" or current == "awaiting_payment":
        return

    # Store the answer in draft_data
    field = _STATE_TO_FIELD.get(current)
    if field:
        state["draft_data"] = {**state["draft_data"], field: message.strip()}

    next_state = _get_next_step(current)

    if next_state:
        # More fields to collect
        state["state"] = next_state
        _upsert_state(state, db)
        prompt = _get_step_prompt(next_state)
        await send_whatsapp_text(phone=phone, text=prompt)
    else:
        # All fields collected — update booking record and send payment link
        await _send_payment_link(state, phone, db)


async def _send_payment_link(state: dict, phone: str, db) -> None:
    """Finalize draft_data on the booking row and generate + send a Razorpay payment link."""
    from app.services.payment_razorpay import create_payment_link

    booking_id = state["booking_id"]
    draft = state["draft_data"]

    # Fetch booking to get booking_ref and amount
    booking_row = (
        db.table("bookings")
        .select("booking_ref,amount_paise")
        .eq("id", booking_id)
        .maybe_single()
        .execute()
    )
    booking = booking_row.data or {}
    booking_ref = booking.get("booking_ref", "GPH-????")
    amount_paise = booking.get("amount_paise", BOOKING_AMOUNT_PAISE)

    # Persist collected data to booking row
    db.table("bookings").update({
        "devotee_name":    draft.get("devotee_name"),
        "rasi":            draft.get("rasi"),
        "nakshatram":      draft.get("nakshatram"),
        "gotram":          draft.get("gotram"),
        "delivery_address": draft.get("delivery_address"),
        "status": "pending_payment",
    }).eq("id", booking_id).execute()

    try:
        result = await create_payment_link(
            booking_id=booking_id,
            booking_ref=booking_ref,
            amount_paise=amount_paise,
            customer_name=draft.get("devotee_name", "Devotee"),
            customer_phone=phone,
            description=f"Guru Peyarchi Homam — {draft.get('devotee_name', 'Devotee')} ({booking_ref})",
        )

        payment_url = result["payment_link_url"]
        razorpay_id = result["razorpay_payment_link_id"]

        # Store payment link on booking
        db.table("bookings").update({
            "payment_link": payment_url,
            "razorpay_payment_id": razorpay_id,
        }).eq("id", booking_id).execute()

        # Advance state
        state["state"] = "awaiting_payment"
        _upsert_state(state, db)

        # Send summary + payment link to lead
        summary = (
            f"🙏 Here is your booking summary:\n\n"
            f"📿 *Event:* Guru Peyarchi Homam\n"
            f"👤 *Name:* {draft.get('devotee_name', '—')}\n"
            f"♈ *Rasi:* {draft.get('rasi', '—')}\n"
            f"⭐ *Nakshatram:* {draft.get('nakshatram', '—')}\n"
            f"🏛️ *Gotram:* {draft.get('gotram', '—')}\n"
            f"📦 *Prasadam address:* {draft.get('delivery_address', '—')}\n\n"
            f"💳 Click to pay and confirm your booking:\n{payment_url}\n\n"
            f"Reference: {booking_ref}"
        )
        await send_whatsapp_text(phone=phone, text=summary)
        logger.info(f"Payment link sent to {phone} for booking {booking_id}")

    except Exception as e:
        logger.error(f"Payment link generation failed for booking {booking_id}: {e}")
        await send_whatsapp_text(
            phone=phone,
            text="🙏 We have received your details! Our team will send you the payment link shortly.",
        )


def confirm_booking(booking_id: str, razorpay_payment_id: str, db=None) -> str | None:
    """
    Mark a booking confirmed after payment. Returns lead phone number for confirmation WA send.
    Called by the Razorpay webhook route.
    """
    db = db or get_supabase()
    from datetime import datetime, timezone

    # Update booking
    db.table("bookings").update({
        "status": "confirmed",
        "razorpay_payment_id": razorpay_payment_id,
        "paid_at": datetime.now(timezone.utc).isoformat(),
        "confirmed_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", booking_id).execute()

    # Reset conversation state to idle
    db.table("lead_conversation_state").update({
        "state": "idle",
    }).eq("booking_id", booking_id).execute()

    # Fetch lead phone for confirmation message
    booking_row = (
        db.table("bookings")
        .select("lead_id, booking_ref, devotee_name")
        .eq("id", booking_id)
        .maybe_single()
        .execute()
    )
    if not booking_row.data:
        return None

    lead_row = (
        db.table("leads")
        .select("phone")
        .eq("id", booking_row.data["lead_id"])
        .maybe_single()
        .execute()
    )
    return (lead_row.data or {}).get("phone"), booking_row.data.get("booking_ref"), booking_row.data.get("devotee_name")
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
pytest tests/test_booking_flow.py -v
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/booking_flow.py backend/tests/test_booking_flow.py
git commit -m "feat: booking flow state machine with Razorpay payment link"
```

---

## Task 5: Bookings route (REST + Razorpay webhook)

**Files:**
- Create: `backend/app/routes/bookings.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write the routes file**

```python
# backend/app/routes/bookings.py
import logging
from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.booking_flow import confirm_booking
from app.services.payment_razorpay import verify_webhook_signature
from app.services.ai_reply import send_whatsapp

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()  # No auth — Razorpay calls this


@router.get("")
async def list_bookings(
    status: str | None = None,
    page: int = 1,
    limit: int = 50,
    tenant_id: str = Depends(get_tenant_id),
):
    db = get_supabase()
    query = (
        db.table("bookings")
        .select("*, leads(name, phone)")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .range((page - 1) * limit, page * limit - 1)
    )
    if status:
        query = query.eq("status", status)
    result = query.execute()
    count_query = db.table("bookings").select("id", count="exact").eq("tenant_id", tenant_id)
    if status:
        count_query = count_query.eq("status", status)
    total = count_query.execute().count or 0
    return {"data": result.data or [], "total": total, "page": page, "limit": limit}


@router.get("/{booking_id}")
async def get_booking(booking_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("bookings")
        .select("*, leads(name, phone)")
        .eq("id", booking_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Booking not found")
    return result.data


@public_router.post("/razorpay-webhook")
async def razorpay_webhook(request: Request):
    """
    Razorpay calls this when a payment link is paid.
    No auth — signature verification replaces auth.
    """
    raw_body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    if not verify_webhook_signature(raw_body, signature):
        logger.warning("Razorpay webhook: invalid signature")
        raise HTTPException(status_code=400, detail="Invalid signature")

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    event = payload.get("event", "")
    if event != "payment_link.paid":
        return {"status": "ignored", "event": event}

    entity = payload.get("payload", {}).get("payment_link", {}).get("entity", {})
    notes = entity.get("notes", {})
    booking_id = notes.get("booking_id")
    razorpay_payment_id = (
        payload.get("payload", {}).get("payment", {}).get("entity", {}).get("id", "")
    )

    if not booking_id:
        logger.error("Razorpay webhook: no booking_id in notes")
        return {"status": "error", "detail": "no booking_id"}

    result = confirm_booking(booking_id, razorpay_payment_id)
    if result and result[0]:
        phone, booking_ref, devotee_name = result
        confirmation_msg = (
            f"🎉 *Booking Confirmed!*\n\n"
            f"🙏 Namaskaram {devotee_name or 'Devotee'},\n\n"
            f"Your Guru Peyarchi Homam booking is confirmed.\n"
            f"📋 *Reference:* {booking_ref}\n\n"
            f"✅ The homam will be performed on the auspicious day.\n"
            f"📹 Video proof will be sent to you after the pooja.\n"
            f"📦 Prasadam will be dispatched within 3–5 days.\n\n"
            f"Thank you for your devotion. 🙏"
        )
        try:
            await send_whatsapp(phone, confirmation_msg)
        except Exception as e:
            logger.error(f"Confirmation WA send failed for {phone}: {e}")

    return {"status": "ok"}
```

- [ ] **Step 2: Register routes in main.py**

Open [backend/app/main.py](backend/app/main.py) and add the imports and route registrations.

Find the existing imports line (line 10):
```python
from app.routes import webhook, leads, messages, analytics, upload, segments, calls, callers, ai_tune, knowledge, system, follow_ups, numbers, incidents, lead_notes, voice_numbers, app_settings, templates, onboarding, team, media, alerts, todos
```

Replace with:
```python
from app.routes import webhook, leads, messages, analytics, upload, segments, calls, callers, ai_tune, knowledge, system, follow_ups, numbers, incidents, lead_notes, voice_numbers, app_settings, templates, onboarding, team, media, alerts, todos, bookings
```

Find the public routes section (after line 62):
```python
app.include_router(calls_public_router, prefix="/api/v1/calls", tags=["calls-telecmi"])
```

Add below it:
```python
app.include_router(bookings.public_router, prefix="/api/v1/bookings", tags=["bookings-webhook"])
```

Find the auth-required routes section and add:
```python
app.include_router(bookings.router, prefix="/api/v1/bookings", tags=["bookings"], dependencies=_auth)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/routes/bookings.py backend/app/main.py
git commit -m "feat: bookings route with list/get endpoints and Razorpay payment webhook"
```

---

## Task 6: Wire booking flow into the webhook

**Files:**
- Modify: `backend/app/routes/webhook.py`

The inbound WhatsApp message handler currently always calls `generate_reply`. We intercept before that: if the lead has an active booking flow state, route to `advance_state` instead.

- [ ] **Step 1: Locate the correct section in webhook.py**

Find lines [174-179](backend/app/routes/webhook.py#L174-L179):

```python
                        # Only trigger AI reply for text messages (not media)
                        if msg_type in ("text", "button", "interactive") and body:
                            try:
                                from app.services.ai_reply import generate_reply
                                await generate_reply(lead_id=lead_id, message=body, phone=phone)
                            except Exception as e:
                                logger.error(f"AI reply failed for lead {lead_id}: {e}")
```

- [ ] **Step 2: Replace that block with booking-flow-aware routing**

```python
                        # Only trigger AI reply for text messages (not media)
                        if msg_type in ("text", "button", "interactive") and body:
                            try:
                                from app.services.booking_flow import (
                                    get_or_create_state,
                                    advance_state,
                                    detect_booking_intent,
                                    start_booking_flow,
                                )
                                conv_state = get_or_create_state(lead_id, tenant_id, db)
                                active_states = {
                                    "collecting_name", "collecting_rasi",
                                    "collecting_nakshatram", "collecting_gotram",
                                    "collecting_address",
                                }
                                if conv_state["state"] in active_states:
                                    # Lead is mid-booking — route to state machine
                                    await advance_state(state=conv_state, message=body, phone=phone, db=db)
                                else:
                                    # Normal AI reply path
                                    from app.services.ai_reply import generate_reply
                                    await generate_reply(lead_id=lead_id, message=body, phone=phone)
                                    # After AI reply, check if this message signals booking intent
                                    if await detect_booking_intent(body) and conv_state["state"] == "idle":
                                        await start_booking_flow(lead_id, tenant_id, phone, db)
                            except Exception as e:
                                logger.error(f"Reply routing failed for lead {lead_id}: {e}")
```

- [ ] **Step 3: Verify the rest of the webhook handler is unchanged**

No other changes to webhook.py are needed. Confirm line count increases by exactly the added lines above.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routes/webhook.py
git commit -m "feat: intercept inbound WA messages for active booking flow"
```

---

## Task 7: Configure Razorpay credentials in app settings

**Files:**
- No code — Supabase data + app settings UI

- [ ] **Step 1: Insert Razorpay settings via Supabase SQL**

Razorpay credentials are stored in `app_settings` (the same table used by Meta/Twilio credentials). Add them:

```sql
INSERT INTO app_settings (key, value, tenant_id)
VALUES
  ('razorpay_key_id',       'rzp_live_XXXXXXXXXXXXXXXXXX', '00000000-0000-0000-0000-000000000001'),
  ('razorpay_key_secret',   'XXXXXXXXXXXXXXXXXXXXXXXX',   '00000000-0000-0000-0000-000000000001'),
  ('razorpay_webhook_secret','XXXXXXXXXXXXXXXXXXXXXXXX',  '00000000-0000-0000-0000-000000000001')
ON CONFLICT (key, tenant_id) DO UPDATE SET value = EXCLUDED.value;
```

Replace the `X` values with your actual Razorpay credentials from the Razorpay Dashboard.

- [ ] **Step 2: Configure Razorpay webhook in Razorpay Dashboard**

1. Go to Razorpay Dashboard → Settings → Webhooks
2. Add webhook URL: `https://your-api-domain.com/api/v1/bookings/razorpay-webhook`
3. Select event: `payment_link.paid`
4. Copy the webhook secret and insert it into `app_settings` (step above)

- [ ] **Step 3: Set booking amount**

The default amount is ₹500 (50000 paise) in [booking_flow.py](backend/app/services/booking_flow.py). Update `BOOKING_AMOUNT_PAISE` to the actual Homam booking fee.

```python
# In backend/app/services/booking_flow.py line ~24
BOOKING_AMOUNT_PAISE = 50000  # ₹500 — update to actual amount
```

---

## Task 8: Admin bookings dashboard page

**Files:**
- Create: `frontend/app/dashboard/bookings/page.tsx`
- Create: `frontend/app/dashboard/bookings/components/BookingTable.tsx`
- Create: `frontend/app/dashboard/bookings/components/BookingStatusBadge.tsx`

- [ ] **Step 1: Create the status badge component**

```tsx
// frontend/app/dashboard/bookings/components/BookingStatusBadge.tsx
import { Badge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:           { label: "Draft",            variant: "secondary" },
  pending_payment: { label: "Awaiting Payment", variant: "outline" },
  confirmed:       { label: "Confirmed",        variant: "default" },
  cancelled:       { label: "Cancelled",        variant: "destructive" },
};

export function BookingStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, variant: "secondary" };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

- [ ] **Step 2: Create the bookings table component**

```tsx
// frontend/app/dashboard/bookings/components/BookingTable.tsx
"use client";

import { BookingStatusBadge } from "./BookingStatusBadge";

interface Booking {
  id: string;
  booking_ref: string;
  devotee_name: string | null;
  rasi: string | null;
  nakshatram: string | null;
  status: string;
  payment_link: string | null;
  confirmed_at: string | null;
  created_at: string;
  leads: { name: string | null; phone: string } | null;
}

interface BookingTableProps {
  bookings: Booking[];
}

export function BookingTable({ bookings }: BookingTableProps) {
  if (!bookings.length) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No bookings yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Reference</th>
            <th className="px-4 py-3 text-left font-medium">Devotee</th>
            <th className="px-4 py-3 text-left font-medium">Phone</th>
            <th className="px-4 py-3 text-left font-medium">Rasi</th>
            <th className="px-4 py-3 text-left font-medium">Nakshatram</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-left font-medium">Booked</th>
            <th className="px-4 py-3 text-left font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {bookings.map((b) => (
            <tr key={b.id} className="hover:bg-muted/30 transition-colors">
              <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                {b.booking_ref ?? "—"}
              </td>
              <td className="px-4 py-3">{b.devotee_name ?? b.leads?.name ?? "—"}</td>
              <td className="px-4 py-3 text-muted-foreground">{b.leads?.phone ?? "—"}</td>
              <td className="px-4 py-3">{b.rasi ?? "—"}</td>
              <td className="px-4 py-3">{b.nakshatram ?? "—"}</td>
              <td className="px-4 py-3">
                <BookingStatusBadge status={b.status} />
              </td>
              <td className="px-4 py-3 text-muted-foreground">
                {new Date(b.created_at).toLocaleDateString("en-IN")}
              </td>
              <td className="px-4 py-3">
                {b.payment_link && b.status === "pending_payment" && (
                  <a
                    href={b.payment_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Payment Link ↗
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create the bookings page**

```tsx
// frontend/app/dashboard/bookings/page.tsx
"use client";

import { useEffect, useState } from "react";
import { BookingTable } from "./components/BookingTable";

const STATUS_FILTERS = [
  { label: "All", value: "" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Awaiting Payment", value: "pending_payment" },
  { label: "Draft", value: "draft" },
  { label: "Cancelled", value: "cancelled" },
];

export default function BookingsPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", limit: "100" });
    if (statusFilter) params.set("status", statusFilter);

    fetch(`/api/v1/bookings?${params}`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => {
        setBookings(d.data ?? []);
        setTotal(d.total ?? 0);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const confirmed = bookings.filter((b) => b.status === "confirmed").length;
  const pending   = bookings.filter((b) => b.status === "pending_payment").length;
  const draft     = bookings.filter((b) => b.status === "draft").length;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Bookings</h1>
        <p className="text-sm text-muted-foreground mt-1">Guru Peyarchi Homam — {total} total</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Confirmed", value: confirmed, color: "text-green-600" },
          { label: "Awaiting Payment", value: pending, color: "text-amber-600" },
          { label: "Draft", value: draft, color: "text-muted-foreground" },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border p-4">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className={`text-3xl font-bold mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              statusFilter === f.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/80"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Loading bookings...</div>
      ) : (
        <BookingTable bookings={bookings} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add Bookings to sidebar navigation**

Find the sidebar component (likely `frontend/app/dashboard/layout.tsx` or a `Sidebar.tsx` component). Search for an existing nav item like "Leads" or "Telecalling" and add a Bookings entry next to it:

```bash
grep -rn "Leads\|telecalling\|href.*dashboard" frontend/app/dashboard/ --include="*.tsx" | head -20
```

Add this nav item alongside the existing ones:
```tsx
{ href: "/dashboard/bookings", label: "Bookings", icon: <BookOpenIcon className="h-4 w-4" /> }
```

Import `BookOpenIcon` from `lucide-react`.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/dashboard/bookings/
git commit -m "feat: add admin bookings dashboard with status filters and summary cards"
```

---

## Task 9: End-to-end integration test

**Files:**
- No new files — manual test script

- [ ] **Step 1: Test booking flow start**

Send a WhatsApp message from a test number to your business number:
```
YES
```

Expected: System replies with:
```
🙏 Wonderful! Please share the *full name* as it should appear in the booking.
```

- [ ] **Step 2: Complete all steps**

Reply with each piece of data and confirm the bot asks the next question in sequence:
1. Send name → bot asks for Rasi
2. Send Rasi → bot asks for Nakshatram
3. Send Nakshatram → bot asks for Gotram
4. Send Gotram → bot asks for address
5. Send address → bot sends summary + Razorpay payment link

- [ ] **Step 3: Complete test payment**

Open the Razorpay payment link in browser. Use test card:
- Card: `4111 1111 1111 1111`
- Expiry: any future date
- CVV: `123`

- [ ] **Step 4: Verify confirmation**

After payment, check:
1. WhatsApp confirmation message received (with booking reference)
2. Booking appears in `/dashboard/bookings` with status `confirmed`
3. `bookings` table row has `paid_at` and `confirmed_at` set

- [ ] **Step 5: Final commit and tag**

```bash
git add .
git commit -m "feat: V2 complete — full Homam booking automation via WhatsApp"
git tag v2-homam-booking-automation
```

---

## V2 Completion Checklist

- [ ] Migrations 028 and 029 applied to production
- [ ] `BOOKING_AMOUNT_PAISE` set to correct amount in `booking_flow.py`
- [ ] Razorpay credentials (`razorpay_key_id`, `razorpay_key_secret`, `razorpay_webhook_secret`) in `app_settings`
- [ ] Razorpay webhook URL registered in Razorpay Dashboard
- [ ] Webhook handler verified using Razorpay test webhook tool
- [ ] End-to-end test on staging passed (all 5 collection steps → payment → confirmation)
- [ ] Bookings page accessible at `/dashboard/bookings`
- [ ] Telecaller path still works in parallel (hot leads with score ≥ 7 still alert)

**Estimated build time:** 8–12 hours of focused development.
