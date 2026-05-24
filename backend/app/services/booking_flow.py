# backend/app/services/booking_flow.py
import logging
import re
from typing import Any

from app.db.supabase import get_supabase

try:
    from app.services.payment_razorpay import create_payment_link
except ImportError:
    create_payment_link = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

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
    "book", "booking", "register", "enroll",
    "புக்", "வேணும்", "பதிவு",
})

BOOKING_AMOUNT_PAISE = 50000


async def detect_booking_intent(message: str) -> bool:
    text = message.strip().lower()
    # Use token split to avoid substring matches (e.g. "book" in "facebook")
    tokens = set(re.findall(r"[\w஀-௿]+", text))
    return bool(tokens & _INTENT_KEYWORDS)


def get_or_create_state(lead_id: str, tenant_id: str, db=None) -> dict:
    """Fetch the conversation state for a lead, or return a fresh idle state.

    Uses .limit(1) instead of .maybe_single() to avoid the HTTP 406 error
    that Supabase raises when no row exists and .single() / .maybe_single()
    is used on an empty result set.
    
    Also checks for inactivity gaps:
    - >1hr: triggers auto-compaction (fire-and-forget)
    - >6hr: session reset (flow state → idle, summary retained) + re-engagement message
    """
    from datetime import datetime, timezone, timedelta
    
    db = db or get_supabase()
    try:
        response = (
            db.table("lead_conversation_state")
            .select("*")
            .eq("lead_id", lead_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.warning(f"lead_conversation_state query failed for lead {lead_id}: {e}. Defaulting to idle state.")
        response = None

    # Guard: response may be None if the query itself raised, or data may be
    # an empty list when the lead has no state row yet — both are handled safely.
    if response and response.data:
        state = response.data[0]
        
        # Check inactivity gap
        last_activity = state.get("last_activity_at")
        if last_activity:
            try:
                last_dt = datetime.fromisoformat(last_activity.replace("Z", "+00:00"))
                now_dt = datetime.now(timezone.utc)
                gap = now_dt - last_dt
                
                # Auto-compact if gap > 1 hour (fire-and-forget)
                if gap > timedelta(hours=1):
                    import asyncio
                    try:
                        from app.services.conversation_compactor import compact_conversation
                        asyncio.create_task(compact_conversation(lead_id, tenant_id, db, mode="rolling"))
                        logger.info(f"Auto-compaction triggered for lead {lead_id} after {gap} inactivity")
                    except Exception as compact_err:
                        logger.error(f"Auto-compaction failed for lead {lead_id}: {compact_err}")
                
                # Session reset if gap > 6 hours
                if gap > timedelta(hours=6):
                    state["state"] = "idle"
                    logger.info(f"Session reset for lead {lead_id} after {gap} inactivity — summary retained for context")
                    
                    # Send re-engagement message
                    try:
                        phone = (
                            db.table("leads")
                            .select("phone")
                            .eq("id", lead_id)
                            .maybe_single()
                            .execute()
                        )
                        phone_number = (phone.data or {}).get("phone")
                        if phone_number:
                            reengagement_msg = "🙏 Welcome back! How can I help you continue?"
                            import asyncio
                            asyncio.create_task(send_whatsapp_text(phone=phone_number, text=reengagement_msg, tenant_id=tenant_id))
                            logger.info(f"Re-engagement message sent to lead {lead_id}")
                    except Exception as reeng_err:
                        logger.error(f"Re-engagement message failed for lead {lead_id}: {reeng_err}")
            except Exception as parse_err:
                logger.warning(f"Failed to parse last_activity_at for lead {lead_id}: {parse_err}")
        
        return state

    # No existing state — return a fresh idle state dict (not persisted yet).
    logger.info(f"No conversation state found for lead {lead_id}. Initialising idle state.")
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
    if state.get("id"):
        db.table("lead_conversation_state").update({
            "state": state["state"],
            "draft_data": state["draft_data"],
            "booking_id": state.get("booking_id"),
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


async def send_whatsapp_text(phone: str, text: str, tenant_id: str | None = None, lead_id: str | None = None) -> None:
    from app.services.ai_reply import send_whatsapp
    await send_whatsapp(phone, text, tenant_id=tenant_id, lead_id=lead_id)


def _create_draft_booking(lead_id: str, tenant_id: str, db) -> dict:
    # Check for an existing non-cancelled booking to prevent duplicates on concurrent messages
    existing = (
        db.table("bookings")
        .select("id, booking_ref, amount_paise")
        .eq("lead_id", lead_id)
        .eq("tenant_id", tenant_id)
        .neq("status", "cancelled")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]
    result = db.table("bookings").insert({
        "lead_id": lead_id,
        "tenant_id": tenant_id,
        "event_name": "Booking",
        "status": "draft",
        "amount_paise": BOOKING_AMOUNT_PAISE,
    }).execute()
    return result.data[0]


async def start_booking_flow(
    lead_id: str,
    tenant_id: str,
    phone: str,
    db=None,
    existing_state: dict | None = None,
) -> None:
    db = db or get_supabase()
    booking = _create_draft_booking(lead_id, tenant_id, db)
    state = {
        "id": (existing_state or {}).get("id"),
        "lead_id": lead_id,
        "tenant_id": tenant_id,
        "flow_name": "booking",
        "state": "collecting_name",
        "draft_data": {},
        "booking_id": booking["id"],
    }
    _upsert_state(state, db)
    await send_whatsapp_text(phone=phone, text=_get_step_prompt("collecting_name"), tenant_id=tenant_id)
    logger.info(f"Booking flow started for lead {lead_id}, booking {booking['id']}")


async def advance_state(state: dict, message: str, phone: str, db=None) -> None:
    db = db or get_supabase()
    current = state["state"]

    if current in ("idle", "awaiting_payment"):
        return

    field = _STATE_TO_FIELD.get(current)
    if field:
        state["draft_data"] = {**state["draft_data"], field: message.strip()}

    next_state = _get_next_step(current)

    if next_state:
        state["state"] = next_state
        _upsert_state(state, db)
        await send_whatsapp_text(phone=phone, text=_get_step_prompt(next_state), tenant_id=state.get("tenant_id"))
    else:
        await _send_payment_link(state, phone, db)


async def _send_payment_link(state: dict, phone: str, db) -> None:
    booking_id = state["booking_id"]
    draft = state["draft_data"]

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
            description=f"Booking — {draft.get('devotee_name', 'Customer')} ({booking_ref})",
        )

        payment_url = result["payment_link_url"]
        razorpay_id = result["razorpay_payment_link_id"]

        db.table("bookings").update({
            "payment_link": payment_url,
            "razorpay_payment_id": razorpay_id,
        }).eq("id", booking_id).execute()

        state["state"] = "awaiting_payment"
        _upsert_state(state, db)

        summary = (
            f"🙏 Here is your booking summary:\n\n"
            f"📋 *Reference:* {booking_ref}\n"
            f"👤 *Name:* {draft.get('devotee_name', '—')}\n"
            f"♈ *Rasi:* {draft.get('rasi', '—')}\n"
            f"⭐ *Nakshatram:* {draft.get('nakshatram', '—')}\n"
            f"🏛️ *Gotram:* {draft.get('gotram', '—')}\n"
            f"📦 *Prasadam address:* {draft.get('delivery_address', '—')}\n\n"
            f"💳 Click to pay and confirm your booking:\n{payment_url}\n\n"
            f"Reference: {booking_ref}"
        )
        await send_whatsapp_text(phone=phone, text=summary, tenant_id=state.get("tenant_id"))
        logger.info(f"Payment link sent to {phone} for booking {booking_id}")

    except Exception as e:
        logger.error(f"Payment link generation failed for booking {booking_id}: {e}")
        state["state"] = "awaiting_payment"
        _upsert_state(state, db)
        await send_whatsapp_text(
            phone=phone,
            text="🙏 We have received your details! Our team will send you the payment link shortly.",
            tenant_id=state.get("tenant_id"),
        )


def confirm_booking(
    booking_id: str,
    razorpay_payment_id: str,
    db=None,
) -> tuple[str | None, str | None, str | None, str | None] | None:
    """Mark booking confirmed. Returns (phone, booking_ref, devotee_name, tenant_id) or None."""
    db = db or get_supabase()
    from datetime import datetime, timezone

    # Idempotency: skip if already confirmed
    existing = (
        db.table("bookings")
        .select("status")
        .eq("id", booking_id)
        .maybe_single()
        .execute()
    )
    if not existing.data or existing.data.get("status") == "confirmed":
        return None

    now_iso = datetime.now(timezone.utc).isoformat()
    db.table("bookings").update({
        "status": "confirmed",
        "razorpay_payment_id": razorpay_payment_id,
        "paid_at": now_iso,
        "confirmed_at": now_iso,
    }).eq("id", booking_id).execute()

    db.table("lead_conversation_state").update({
        "state": "idle",
    }).eq("booking_id", booking_id).execute()

    booking_row = (
        db.table("bookings")
        .select("lead_id, booking_ref, devotee_name, tenant_id")
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
    phone = (lead_row.data or {}).get("phone")
    return (
        phone,
        booking_row.data.get("booking_ref"),
        booking_row.data.get("devotee_name"),
        booking_row.data.get("tenant_id"),
    )
