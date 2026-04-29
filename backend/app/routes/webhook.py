import logging
from fastapi import APIRouter, Form, Request, Response
from app.db.supabase import get_supabase
from app.config import settings
from app.services.growth import record_stage_event
from app.services.failover import update_number_quality, handle_quality_red, handle_quality_yellow

logger = logging.getLogger(__name__)
router = APIRouter()

_STOP_WORDS = frozenset({"stop", "unsubscribe", "cancel", "quit", "end", "optout", "opt out", "opt-out"})


def _get_tenant_id_for_meta_number(phone_number_id: str, db) -> str | None:
    result = db.table("phone_numbers").select("tenant_id").eq("meta_phone_number_id", phone_number_id).maybe_single().execute()
    return (result.data or {}).get("tenant_id")


def _get_tenant_id_for_twilio_number(number: str, db) -> str | None:
    result = db.table("phone_numbers").select("tenant_id").eq("number", number).maybe_single().execute()
    return (result.data or {}).get("tenant_id")


def _handle_opt_out(phone: str, db) -> bool:
    try:
        lead = db.table("leads").select("id").eq("phone", phone).maybe_single().execute()
        if not lead.data:
            return False
        db.table("leads").update({"opted_out": True, "ai_enabled": False}).eq("id", lead.data["id"]).execute()
        logger.info(f"Lead {lead.data['id']} opted out via STOP from {phone}")
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
                        if msg_type not in ("text", "button", "interactive"):
                            continue
                        wa_id = msg.get("from", "")
                        msg_id = msg.get("id")
                        phone = f"+{wa_id}" if wa_id and not wa_id.startswith("+") else wa_id
                        
                        body = ""
                        media_type = None
                        media_url = None
                        media_filename = None
                        media_mime_type = None

                        if msg_type == "text":
                            body = msg.get("text", {}).get("body", "").strip()
                        elif msg_type == "button":
                            body = msg.get("button", {}).get("text", "").strip()
                        elif msg_type == "interactive":
                            inter = msg.get("interactive", {})
                            body = (inter.get("button_reply") or inter.get("list_reply") or {}).get("title", "").strip()
                        elif msg_type in ("image", "document", "audio", "video", "sticker"):
                            media_obj = msg.get(msg_type, {})
                            media_id = media_obj.get("id", "")
                            media_mime_type = media_obj.get("mime_type", "")
                            media_filename = media_obj.get("filename") or f"file.{media_mime_type.split('/')[-1] if media_mime_type else 'bin'}"
                            caption = media_obj.get("caption", "")
                            media_type = msg_type
                            media_url = f"meta:{media_id}" if media_id else None
                            body = caption if caption else f"[{msg_type}: {media_filename}]"

                        if not phone:
                            continue
                        if not body and not media_type:
                            continue

                        logger.info(f"Inbound Meta WhatsApp from {phone}: type={msg_type} body={body!r}")

                        if body and body.lower().strip() in _STOP_WORDS:
                            _handle_opt_out(phone, db)
                            continue

                        existing = db.table("leads").select("id,score,segment").eq("phone", phone).eq("tenant_id", tenant_id).limit(1).execute()
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
                            record_stage_event(lead_id, to_segment="C", event_type="created", metadata={"source": "whatsapp"}, db=db)

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
                        if media_type:
                            insert_row["media_type"] = media_type
                        if media_url:
                            insert_row["media_url"] = media_url
                        if media_filename:
                            insert_row["media_filename"] = media_filename
                        if media_mime_type:
                            insert_row["media_mime_type"] = media_mime_type

                        db.table("messages").insert(insert_row).execute()

                        # Only trigger AI reply for text messages (not media)
                        if msg_type in ("text", "button", "interactive") and body:
                            try:
                                from app.services.ai_reply import generate_reply
                                await generate_reply(lead_id=lead_id, message=body, phone=phone)
                            except Exception as e:
                                logger.error(f"AI reply failed for lead {lead_id}: {e}")

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

    if Body and Body.lower().strip() in _STOP_WORDS:
        _handle_opt_out(phone, db)
        return Response(content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>', media_type="text/xml")

    # Upsert lead
    existing = db.table("leads").select("id,score,segment").eq("phone", phone).eq("tenant_id", tenant_id).limit(1).execute()
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
