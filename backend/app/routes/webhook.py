import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Form, Request, Response
from app.db.supabase import get_supabase
from app.config import settings
from app.services.growth import record_stage_event
from app.services.failover import update_number_quality, handle_quality_red, handle_quality_yellow

logger = logging.getLogger(__name__)
router = APIRouter()

# Exact-match opt-out phrases (short replies)
_STOP_WORDS = frozenset({
    "stop", "unsubscribe", "cancel", "quit", "end", "optout", "opt out", "opt-out",
    "not interested", "no thanks", "remove me", "dont send", "don't send", "no",
    "ஆர்வமில்லை", "ஆர்வம் இல்லை", "வேண்டாம்", "வேண்டாம்", "நோ", "வேண்டாம் நன்றி",
})

# Phrases that signal opt-out even when embedded in a longer message
_OPT_OUT_PHRASES = (
    "not interested", "no thanks", "dont contact", "don't contact", "remove me",
    "ஆர்வம் இல்லை", "ஆர்வமில்லை", "வேண்டாம்",
)


def _is_opt_out(body: str) -> bool:
    normalized = body.lower().strip()
    if normalized in _STOP_WORDS:
        return True
    return any(phrase in normalized for phrase in _OPT_OUT_PHRASES)


def _get_tenant_id_for_meta_number(phone_number_id: str, db) -> str | None:
    try:
        result = db.table("phone_numbers").select("tenant_id").eq("meta_phone_number_id", phone_number_id).maybe_single().execute()
        return (result.data or {}).get("tenant_id") if result else None
    except Exception:
        return None


def _get_tenant_id_for_twilio_number(number: str, db) -> str | None:
    try:
        result = db.table("phone_numbers").select("tenant_id").eq("number", number).maybe_single().execute()
        return (result.data or {}).get("tenant_id") if result else None
    except Exception:
        return None


async def _handle_opt_out(phone: str, tenant_id: str, db) -> bool:
    try:
        lead = db.table("leads").select("id").eq("phone", phone).eq("tenant_id", tenant_id).maybe_single().execute()
        if not lead.data:
            return False
        lead_id = lead.data["id"]
        db.table("leads").update({"opted_out": True, "ai_enabled": False, "opted_out_at": datetime.now(timezone.utc).isoformat()}).eq("id", lead_id).eq("tenant_id", tenant_id).execute()
        logger.info(f"Lead {lead_id} opted out from {phone}")
        # Send a polite acknowledgment — one-time, no further AI replies
        try:
            from app.services.meta_cloud import send_text_message
            await send_text_message(
                to_number=phone,
                text="நன்றி! உங்கள் விருப்பத்தை மதிக்கிறோம். இனிமேல் நாங்கள் உங்களை தொடர்பு கொள்ள மாட்டோம். 🙏\n\n(Thank you! We respect your preference and will not contact you further.)",
                tenant_id=tenant_id,
            )
        except Exception as e:
            logger.warning(f"Opt-out reply failed for {phone}: {e}")
        return True
    except Exception as e:
        logger.error(f"opt-out DB update failed for {phone}: {e}")
        return False


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
                field = change.get("field")
                value = change.get("value", {})

                if field == "phone_number_quality_update":
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

                elif field == "messages":
                    meta_phone_number_id = value.get("metadata", {}).get("phone_number_id", "")
                    db = get_supabase()
                    tenant_id = _get_tenant_id_for_meta_number(meta_phone_number_id, db) if meta_phone_number_id else None
                    if not tenant_id:
                        logger.warning(f"No tenant for meta phone_number_id={meta_phone_number_id}, using default")
                        tenant_id = "00000000-0000-0000-0000-000000000001"
                    for msg in value.get("messages", []):
                        msg_type = msg.get("type")
                        msg_id = msg.get("id", "")
                        if msg_type not in ("text", "button", "interactive"):
                            continue
                        wa_id = msg.get("from", "")
                        phone = f"+{wa_id}" if wa_id and not wa_id.startswith("+") else wa_id
                        if msg_type == "text":
                            body = msg.get("text", {}).get("body", "").strip()
                        elif msg_type == "button":
                            body = msg.get("button", {}).get("text", "").strip()
                        elif msg_type == "interactive":
                            inter = msg.get("interactive", {})
                            body = (inter.get("button_reply") or inter.get("list_reply") or {}).get("title", "").strip()
                        else:
                            body = ""

                        if not phone or not body:
                            continue

                        logger.info(f"Inbound Meta WhatsApp from {phone}: type={msg_type} body={body!r}")

                        if body and _is_opt_out(body):
                            await _handle_opt_out(phone, tenant_id, db)
                            continue

                        existing = db.table("leads").select("id,score,segment,deleted_at,ai_enabled").eq("phone", phone).eq("tenant_id", tenant_id).limit(1).execute()
                        if existing.data:
                            lead_id = existing.data[0]["id"]
                            if existing.data[0].get("deleted_at"):
                                db.table("leads").update({
                                    "deleted_at": None,
                                    "ai_enabled": True,
                                    "needs_human_intervention": False,
                                }).eq("id", lead_id).execute()
                                logger.info(f"Restored soft-deleted lead {lead_id} on inbound message")
                        else:
                            new_lead = db.table("leads").insert({
                                "phone": phone,
                                "source": "whatsapp",
                                "score": 5,
                                "segment": "C",
                                "tenant_id": tenant_id,
                            }).execute()
                            lead_id = new_lead.data[0]["id"]
                            record_stage_event(lead_id, to_segment="C", event_type="created", metadata={"source": "whatsapp"}, tenant_id=tenant_id, db=db)
                            try:
                                from app.services.assignment import auto_assign_lead
                                auto_assign_lead(lead_id, tenant_id)
                            except Exception as e:
                                logger.warning(f"Auto-assign failed for lead {lead_id}: {e}")

                        already = db.table("messages").select("id").eq("meta_message_id", msg_id).limit(1).execute()
                        if already.data:
                            continue

                        insert_row: dict = {
                            "lead_id": lead_id,
                            "direction": "inbound",
                            "channel": "whatsapp",
                            "content": body,
                            "is_ai_generated": False,
                            "meta_message_id": msg_id,
                            "tenant_id": tenant_id,
                        }
                        db.table("messages").insert(insert_row).execute()

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
                                    await advance_state(state=conv_state, message=body, phone=phone, db=db)
                                else:
                                    if conv_state["state"] == "idle" and await detect_booking_intent(body):
                                        await start_booking_flow(lead_id, tenant_id, phone, db, existing_state=conv_state)
                                    else:
                                        from app.services.ai_reply import generate_reply
                                        await generate_reply(lead_id=lead_id, message=body, phone=phone)
                            except Exception as e:
                                logger.error(f"Reply routing failed for lead {lead_id}: {e}")

                    # Handle message status updates (delivered, read, failed)
                    for status_update in value.get("statuses", []):
                        message_id = status_update.get("id")
                        status = status_update.get("status")
                        
                        if message_id and status in ("delivered", "read", "failed"):
                            try:
                                db.table("messages") \
                                    .update({"delivery_status": status}) \
                                    .eq("meta_message_id", message_id) \
                                    .execute()
                                logger.info(f"Message {message_id} status updated to {status}")
                            except Exception as e:
                                logger.error(f"Failed to update message {message_id} status to {status}: {e}")

        return {"status": "ok"}

    if not From or not Body or not MessageSid:
        return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>', media_type="text/xml")

    phone = From.replace("whatsapp:", "").strip().replace(" ", "")
    if phone and not phone.startswith("+"):
        phone = "+" + phone
    to_number = (To or "").replace("whatsapp:", "").strip()
    db = get_supabase()
    tenant_id = _get_tenant_id_for_twilio_number(to_number, db) if to_number else None
    if not tenant_id:
        logger.warning(f"No tenant for Twilio number={to_number}, using default")
        tenant_id = "00000000-0000-0000-0000-000000000001"
    logger.info(f"Inbound WhatsApp from {phone}: {Body!r}")

    if Body and _is_opt_out(Body):
        await _handle_opt_out(phone, tenant_id, db)
        return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>', media_type="text/xml")

    # Upsert lead
    existing = db.table("leads").select("id,score,segment").eq("phone", phone).eq("tenant_id", tenant_id).is_("deleted_at", "null").limit(1).execute()
    if existing.data:
        lead_id = existing.data[0]["id"]
    else:
        new_lead = db.table("leads").insert({
            "phone": phone,
            "source": "whatsapp",
            "score": 5,
            "segment": "C",
            "tenant_id": tenant_id,
        }).execute()
        lead_id = new_lead.data[0]["id"]
        record_stage_event(
            lead_id,
            to_segment="C",
            event_type="created",
            metadata={"source": "whatsapp"},
            tenant_id=tenant_id,
            db=db,
        )

    # Store inbound message
    db.table("messages").insert({
        "lead_id": lead_id,
        "direction": "inbound",
        "channel": "whatsapp",
        "content": Body,
        "is_ai_generated": False,
        "twilio_message_sid": MessageSid,
        "tenant_id": tenant_id,
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
