import logging
from fastapi import APIRouter, Form, Request, Response
from app.db.supabase import get_supabase
from app.config import settings
from app.services.growth import record_stage_event
from app.services.failover import update_number_quality, handle_quality_red, handle_quality_yellow

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def verify_webhook(request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    verify_token = settings.meta_verify_token
    if not verify_token:
        from app.config_dynamic import get_setting
        verify_token = get_setting("meta_webhook_verify_token")

    if mode == "subscribe" and token == verify_token:
        logger.info("WhatsApp webhook verified successfully")
        return Response(content=challenge, media_type="text/plain")

    logger.warning(f"Webhook verification failed — token mismatch. received={token}")
    return Response(content="Forbidden", status_code=403)


@router.post("")
async def whatsapp_webhook(
    request: Request,
    From: str | None = Form(None),
    To: str | None = Form(None),
    Body: str | None = Form(None),
    MessageSid: str | None = Form(None),
):
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            payload = await request.json()
        except Exception:
            payload = {}
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                if change.get("field") == "phone_number_quality_update":
                    value = change.get("value", {})
                    meta_phone_number_id = value.get("phone_number_id")
                    quality_rating = value.get("quality_rating", "")
                    current_limit = value.get("current_limit")
                    messaging_tier = None
                    if current_limit and current_limit.startswith("TIER_"):
                        try:
                            messaging_tier = int(current_limit.replace("TIER_", ""))
                        except ValueError:
                            pass
                    logger.info(f"phone_number_quality_update: meta_id={meta_phone_number_id} quality={quality_rating} limit={current_limit}")
                    row_id = await update_number_quality(meta_phone_number_id, quality_rating, messaging_tier)
                    if row_id:
                        if quality_rating == "RED":
                            await handle_quality_red(row_id)
                        elif quality_rating == "YELLOW":
                            await handle_quality_yellow(row_id)
                    return {"status": "ok"}
        return {"status": "ok"}

    if not From or not Body or not MessageSid:
        return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>', media_type="text/xml")

    phone = From.replace("whatsapp:", "").strip().replace(" ", "")
    if phone and not phone.startswith("+"):
        phone = "+" + phone
    db = get_supabase()
    logger.info(f"Inbound WhatsApp from {phone}: {Body!r}")

    # Upsert lead
    existing = db.table("leads").select("id,score,segment").eq("phone", phone).limit(1).execute()
    if existing.data:
        lead_id = existing.data[0]["id"]
    else:
        new_lead = db.table("leads").insert({
            "phone": phone,
            "source": "whatsapp",
            "score": 5,
            "segment": "C"
        }).execute()
        lead_id = new_lead.data[0]["id"]
        record_stage_event(
            lead_id,
            to_segment="C",
            event_type="created",
            metadata={"source": "whatsapp"},
            db=db,
        )

    # Store inbound message
    db.table("messages").insert({
        "lead_id": lead_id,
        "direction": "inbound",
        "channel": "whatsapp",
        "content": Body,
        "is_ai_generated": False,
        "twilio_message_sid": MessageSid
    }).execute()

    # Trigger AI reply (non-blocking, best-effort)
    try:
        from app.services.ai_reply import generate_reply
        await generate_reply(lead_id=lead_id, message=Body, phone=phone)
    except Exception as e:
        logger.error(f"AI reply failed for lead {lead_id}: {e}")

    # Return empty TwiML so Twilio doesn't retry
    twiml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
    return Response(content=twiml, media_type="text/xml")
