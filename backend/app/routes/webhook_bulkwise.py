"""
Inbound webhook handler for Bulkwise platform.

Configure in Bulkwise dashboard → Settings → Webhook:
  URL: https://<your-render-app>.onrender.com/webhook/bulkwise

Bulkwise POSTs JSON for every inbound message. Payload fields vary by plan
version; this handler normalises the common variants and logs the raw body
on first parse so you can inspect the exact shape in Render logs.
"""

import logging
from fastapi import APIRouter, Request, Response
from app.db.supabase import get_supabase
from app.services.growth import record_stage_event

logger = logging.getLogger(__name__)
router = APIRouter()

_STOP_WORDS = frozenset({"stop", "unsubscribe", "cancel", "quit", "end", "optout", "opt out", "opt-out"})

_RAW_LOGGED = False  # log the full payload once on first receipt to confirm shape


def _get_tenant_id(phone_number_id: str, db) -> str | None:
    try:
        result = (
            db.table("phone_numbers")
            .select("tenant_id")
            .eq("meta_phone_number_id", phone_number_id)
            .maybe_single()
            .execute()
        )
        return (result.data or {}).get("tenant_id") if result else None
    except Exception:
        return None


def _handle_opt_out(phone: str, db) -> None:
    try:
        lead = db.table("leads").select("id").eq("phone", phone).maybe_single().execute()
        if lead.data:
            db.table("leads").update({"opted_out": True, "ai_enabled": False}).eq("id", lead.data["id"]).execute()
    except Exception as e:
        logger.error("opt-out failed for %s: %s", phone, e)


def _extract_fields(payload: dict) -> dict:
    """
    Normalise Bulkwise webhook payload into a flat dict with known keys.
    Bulkwise sends different shapes depending on message type — try each.

    Known field names across Bulkwise versions:
      phone_number_id  / phoneNumberId
      sender_phone_number / phone_number / contact_number / chat_id
      message / text / body
      message_type / type
      wa_message_id / message_id
    """
    def _first(*keys):
        for k in keys:
            v = payload.get(k)
            if v is not None:
                return v
        return None

    phone_number_id = _first("phone_number_id", "phoneNumberId", "phone_number_id")
    raw_sender = _first(
        "sender_phone_number", "contact_number", "phone_number",
        "chat_id", "from", "sender"
    )
    msg_type = (_first("message_type", "type") or "text").lower()
    body = _first("message", "text", "body", "content") or ""
    wa_message_id = _first("wa_message_id", "message_id", "id") or ""

    # Normalise sender to E.164
    sender = ""
    if raw_sender:
        s = str(raw_sender).strip()
        sender = f"+{s}" if not s.startswith("+") else s

    return {
        "phone_number_id": phone_number_id or "",
        "sender": sender,
        "msg_type": msg_type,
        "body": str(body).strip(),
        "wa_message_id": wa_message_id,
    }


@router.post("")
async def bulkwise_webhook(request: Request):
    global _RAW_LOGGED
    try:
        payload = await request.json()
    except Exception:
        payload = {}

    if not _RAW_LOGGED:
        logger.info("Bulkwise webhook raw payload (first receipt): %s", payload)
        _RAW_LOGGED = True

    fields = _extract_fields(payload)
    phone_number_id = fields["phone_number_id"]
    phone = fields["sender"]
    msg_type = fields["msg_type"]
    body = fields["body"]
    wa_message_id = fields["wa_message_id"]

    if not phone or not body:
        logger.debug("Bulkwise webhook: empty phone or body — skipping. raw=%s", payload)
        return {"status": "ok"}

    if msg_type not in ("text", "button", "interactive"):
        logger.debug("Bulkwise webhook: unsupported type %s — skipping", msg_type)
        return {"status": "ok"}

    db = get_supabase()

    tenant_id = _get_tenant_id(phone_number_id, db) if phone_number_id else None
    if not tenant_id:
        logger.warning("Bulkwise webhook: no tenant for phone_number_id=%s, using default", phone_number_id)
        tenant_id = "00000000-0000-0000-0000-000000000001"

    logger.info("Inbound Bulkwise from %s: type=%s body=%r", phone, msg_type, body)

    if body.lower() in _STOP_WORDS:
        _handle_opt_out(phone, db)
        return {"status": "ok"}

    # Deduplicate by wa_message_id
    if wa_message_id:
        already = db.table("messages").select("id").eq("meta_message_id", wa_message_id).limit(1).execute()
        if already.data:
            return {"status": "ok"}

    # Upsert lead
    existing = (
        db.table("leads")
        .select("id,score,segment,deleted_at,ai_enabled")
        .eq("phone", phone)
        .eq("tenant_id", tenant_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        lead_id = existing.data[0]["id"]
        if existing.data[0].get("deleted_at"):
            db.table("leads").update({
                "deleted_at": None,
                "ai_enabled": True,
                "needs_human_intervention": False,
            }).eq("id", lead_id).execute()
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
            metadata={"source": "bulkwise"},
            tenant_id=tenant_id,
            db=db,
        )
        try:
            from app.services.assignment import auto_assign_lead
            auto_assign_lead(lead_id, tenant_id)
        except Exception as e:
            logger.warning("Auto-assign failed for lead %s: %s", lead_id, e)

    # Store inbound message
    db.table("messages").insert({
        "lead_id": lead_id,
        "direction": "inbound",
        "channel": "whatsapp",
        "content": body,
        "is_ai_generated": False,
        "meta_message_id": wa_message_id or None,
        "tenant_id": tenant_id,
    }).execute()

    # Fire AI reply
    try:
        from app.services.ai_reply import generate_reply
        await generate_reply(lead_id=lead_id, message=body, phone=phone, tenant_id=tenant_id)
    except Exception as e:
        logger.error("AI reply failed for lead %s: %s", lead_id, e)

    return {"status": "ok"}
