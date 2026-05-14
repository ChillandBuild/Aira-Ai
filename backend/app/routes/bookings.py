import logging
from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.booking_flow import confirm_booking
from app.services.payment_razorpay import verify_webhook_signature
from app.services.ai_reply import send_whatsapp

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()


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
        phone, booking_ref, devotee_name, tenant_id = result
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
            await send_whatsapp(phone, confirmation_msg, tenant_id=tenant_id)
        except Exception as e:
            logger.error(f"Confirmation WA send failed for {phone}: {e}")

    return {"status": "ok"}
