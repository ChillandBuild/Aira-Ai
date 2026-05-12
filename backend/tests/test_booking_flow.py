# backend/tests/test_booking_flow.py
import pytest
from unittest.mock import MagicMock, AsyncMock, patch


def _make_db(state_row=None, booking_row=None):
    db = MagicMock()

    state_chain = MagicMock()
    state_chain.maybe_single.return_value.execute.return_value.data = state_row

    booking_insert_result = MagicMock()
    booking_insert_result.data = [booking_row or {"id": "booking-1", "booking_ref": "GPH-2026-0001", "amount_paise": 50000}]

    booking_select_chain = MagicMock()
    booking_select_chain.maybe_single.return_value.execute.return_value.data = (
        booking_row or {"id": "booking-1", "booking_ref": "GPH-2026-0001", "amount_paise": 50000}
    )

    def table_selector(name):
        t = MagicMock()
        if "state" in name:
            t.select.return_value.eq.return_value = state_chain
            t.insert.return_value.execute.return_value.data = [{"id": "new-state-id"}]
            t.update.return_value.eq.return_value.execute.return_value.data = []
        elif name == "bookings":
            t.select.return_value.eq.return_value = booking_select_chain
            t.insert.return_value.execute.return_value = booking_insert_result
            t.update.return_value.eq.return_value.execute.return_value.data = []
        else:
            t.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None
        return t

    db.table.side_effect = table_selector
    return db


# --- detect_booking_intent ---

@pytest.mark.asyncio
async def test_detect_booking_intent_positive():
    from app.services.booking_flow import detect_booking_intent
    for msg in ["YES", "yes please", "BOOK", "i want to book", "interested"]:
        assert await detect_booking_intent(msg) is True


@pytest.mark.asyncio
async def test_detect_booking_intent_negative():
    from app.services.booking_flow import detect_booking_intent
    for msg in ["what is the cost?", "STOP", "tell me more about the event"]:
        assert await detect_booking_intent(msg) is False


# --- get_or_create_state ---

def test_get_or_create_state_existing():
    from app.services.booking_flow import get_or_create_state
    existing = {
        "id": "state-1", "lead_id": "lead-1", "state": "collecting_rasi",
        "draft_data": {"devotee_name": "Rajan"}, "booking_id": "booking-1", "tenant_id": "tenant-1",
    }
    db = _make_db(state_row=existing)
    result = get_or_create_state("lead-1", "tenant-1", db)
    assert result["state"] == "collecting_rasi"
    assert result["draft_data"]["devotee_name"] == "Rajan"


def test_get_or_create_state_new():
    from app.services.booking_flow import get_or_create_state
    db = _make_db(state_row=None)
    result = get_or_create_state("lead-1", "tenant-1", db)
    assert result["state"] == "idle"
    assert result["draft_data"] == {}


# --- advance_state: collecting_name → collecting_rasi ---

@pytest.mark.asyncio
async def test_advance_state_name_to_rasi():
    from app.services.booking_flow import advance_state

    state = {
        "id": "state-1", "lead_id": "lead-1", "state": "collecting_name",
        "draft_data": {}, "booking_id": "booking-1", "tenant_id": "tenant-1",
    }
    db = _make_db(state_row=state)

    with patch("app.services.booking_flow.send_whatsapp_text", new_callable=AsyncMock) as mock_send:
        await advance_state(state=state, message="Rajan Kumar", phone="+919876543210", db=db)
        mock_send.assert_called_once()
        sent_text = mock_send.call_args[1]["text"]
        assert "rasi" in sent_text.lower() or "zodiac" in sent_text.lower()


# --- advance_state: collecting_address triggers payment link ---

@pytest.mark.asyncio
async def test_advance_state_address_triggers_payment():
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

        mock_pay.assert_called_once()
        mock_send.assert_called_once()
        sent_text = mock_send.call_args[1]["text"]
        assert "rzp.io" in sent_text or "payment" in sent_text.lower()
