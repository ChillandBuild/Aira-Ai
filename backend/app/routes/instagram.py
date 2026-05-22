import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, Response
from app.db.supabase import get_supabase
from app.config import settings
from app.services.growth import record_stage_event
from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)
router = APIRouter()


# Exact-match opt-out phrases (same set as WhatsApp)
_STOP_WORDS = frozenset({
    "stop", "unsubscribe", "cancel", "quit", "end", "optout", "opt out", "opt-out",
    "not interested", "no thanks", "remove me", "dont send", "don't send", "no",
    "ஆர்வமில்லை", "ஆர்வம் இல்லை", "வேண்டாம்", "வேண்டாம்", "நோ", "வேண்டாம் நன்றி",
})

_OPT_OUT_PHRASES = (
    "not interested", "no thanks", "dont contact", "don't contact", "remove me",
    "ஆர்வம் இல்லை", "ஆர்வமில்லை", "வேண்டாம்",
)


def _is_opt_out(body: str) -> bool:
    normalized = body.lower().strip()
    if normalized in _STOP_WORDS:
        return True
    return any(phrase in normalized for phrase in _OPT_OUT_PHRASES)


@router.get("/{tenant_id}")
async def verify_instagram_webhook(request: Request, tenant_id: str):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    verify_token = get_setting("meta_webhook_verify_token", tenant_id=tenant_id) or settings.meta_verify_token

    if mode == "subscribe" and token == verify_token:
        logger.info(f"Instagram webhook verified for tenant {tenant_id}")
        return Response(content=challenge, media_type="text/plain")

    logger.warning(f"Instagram webhook verification failed for tenant {tenant_id} — token mismatch")
    return Response(content="Forbidden", status_code=403)


@router.post("/{tenant_id}")
async def instagram_webhook(request: Request, tenant_id: str):
    try:
        payload = await request.json()
    except Exception:
        logger.warning("Instagram webhook received invalid JSON")
        return {"status": "ok"}

    if payload.get("object") != "instagram":
        return {"status": "ok"}

    db = get_supabase()

    for entry in payload.get("entry", []):
        for messaging in entry.get("messaging", []):
            sender = messaging.get("sender", {})
            message = messaging.get("message", {})

            ig_user_id = sender.get("id", "")
            msg_id = message.get("mid", "")
            body = (message.get("text") or "").strip()

            if not ig_user_id or not body:
                continue

            logger.info(f"Inbound Instagram DM from {ig_user_id}: {body!r}")

            if _is_opt_out(body):
                # Instagram opt-out: disable AI, no further auto-replies
                lead = db.table("leads").select("id").eq("ig_user_id", ig_user_id).eq("tenant_id", tenant_id).maybe_single().execute()
                if lead and lead.data:
                    db.table("leads").update({
                        "opted_out": True,
                        "ai_enabled": False,
                        "opted_out_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", lead.data["id"]).eq("tenant_id", tenant_id).execute()
                    logger.info(f"Lead {lead.data['id']} opted out from Instagram")
                continue

            existing = db.table("leads").select("id,score,segment,deleted_at,ai_enabled").eq("ig_user_id", ig_user_id).eq("tenant_id", tenant_id).limit(1).execute()
            if existing.data:
                lead_id = existing.data[0]["id"]
                if existing.data[0].get("deleted_at"):
                    db.table("leads").update({
                        "deleted_at": None,
                        "ai_enabled": True,
                        "needs_human_intervention": False,
                    }).eq("id", lead_id).execute()
                    logger.info(f"Restored soft-deleted lead {lead_id} on Instagram inbound")
            else:
                new_lead = db.table("leads").insert({
                    "phone": None,
                    "ig_user_id": ig_user_id,
                    "source": "instagram",
                    "score": 5,
                    "segment": "C",
                    "tenant_id": tenant_id,
                }).execute()
                lead_id = new_lead.data[0]["id"]
                record_stage_event(lead_id, to_segment="C", event_type="created", metadata={"source": "instagram"}, tenant_id=tenant_id, db=db)
                try:
                    from app.services.assignment import auto_assign_lead
                    auto_assign_lead(lead_id, tenant_id)
                except Exception as e:
                    logger.warning(f"Auto-assign failed for Instagram lead {lead_id}: {e}")

            # Deduplicate
            already = db.table("messages").select("id").eq("meta_message_id", msg_id).limit(1).execute()
            if already.data:
                continue

            db.table("messages").insert({
                "lead_id": lead_id,
                "direction": "inbound",
                "channel": "instagram",
                "content": body,
                "is_ai_generated": False,
                "meta_message_id": msg_id,
                "tenant_id": tenant_id,
            }).execute()

            # Update conversation state
            from app.services.booking_flow import get_or_create_state
            conv_state = get_or_create_state(lead_id, tenant_id, db)
            new_count = (conv_state.get("message_count") or 0) + 1
            db.table("lead_conversation_state").update({
                "message_count": new_count,
                "last_activity_at": datetime.now(timezone.utc).isoformat(),
            }).eq("lead_id", lead_id).execute()

            # Compaction
            if new_count >= 10:
                try:
                    from app.services.conversation_compactor import compact_conversation
                    await compact_conversation(lead_id, tenant_id, db, mode="rolling")
                except Exception as compact_err:
                    logger.error(f"Compaction failed for Instagram lead {lead_id}: {compact_err}")

            # AI reply
            try:
                from app.services.context_builder import build_scorer_context
                from app.services.ai_reply import generate_reply
                context_block = build_scorer_context(lead_id, db)
                await generate_reply(
                    lead_id=lead_id,
                    message=body,
                    channel="instagram",
                    ig_user_id=ig_user_id,
                    context_block=context_block,
                )
            except Exception as e:
                logger.error(f"AI reply failed for Instagram lead {lead_id}: {e}")

    return {"status": "ok"}
