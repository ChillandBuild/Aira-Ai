import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, BackgroundTasks, Response
from app.db.supabase import get_supabase
from app.config import settings
from app.config_dynamic import get_setting
from app.services.growth import record_stage_event
from app.services.ai_reply import generate_reply
from app.services.meta_webhook_verify import verify_meta_signature, resolve_tenant_for_page
from app.services.automation_triggers import fire_trigger

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{tenant_id}")
async def verify_facebook_webhook(tenant_id: str, request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    # Use tenant-specific verify token, fallback to global
    verify_token = get_setting("meta_webhook_verify_token", tenant_id=tenant_id) or settings.meta_verify_token

    if mode == "subscribe" and token == verify_token:
        logger.info(f"Facebook webhook verified successfully for tenant {tenant_id}")
        return Response(content=challenge, media_type="text/plain")

    logger.warning(f"Facebook webhook verification failed for tenant {tenant_id} — token mismatch. received={token}")
    return Response(content="Forbidden", status_code=403)


@router.post("/{tenant_id}")
async def facebook_webhook(tenant_id: str, request: Request, background_tasks: BackgroundTasks):
    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    if not verify_meta_signature(raw_body, signature, tenant_id):
        # Return 200 for echo messages (our own sent messages bounced back by Meta)
        # so Meta stops retrying them.
        try:
            import json as _json
            _payload = _json.loads(raw_body.decode("utf-8")) if raw_body else {}
            _is_echo = any(
                event.get("message", {}).get("is_echo")
                for entry in _payload.get("entry", [])
                for event in entry.get("messaging", [])
            )
            if _is_echo:
                return {"status": "ok", "detail": "echo_ignored"}
        except Exception:
            pass
        logger.warning(f"Facebook webhook signature invalid for tenant {tenant_id}")
        return Response(content="Forbidden", status_code=403)

    try:
        import json as _json
        payload = _json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception:
        logger.error("Failed to parse Facebook webhook request JSON")
        return {"status": "ok", "detail": "invalid_json"}

    # Meta Messenger payloads have "object": "page"
    if payload.get("object") != "page":
        return {"status": "ok", "detail": "not_page_object"}

    entries = payload.get("entry", [])
    db = get_supabase()

    for entry in entries:
        page_id = entry.get("id", "")
        # Validate that this page_id belongs to the tenant in the URL
        owner_tenant = resolve_tenant_for_page(page_id, "facebook")
        if owner_tenant and owner_tenant != tenant_id:
            logger.warning(
                f"Facebook page_id {page_id} belongs to tenant {owner_tenant}, "
                f"not {tenant_id} (URL) — skipping entry"
            )
            continue
        messaging = entry.get("messaging", [])
        for event in messaging:
            # Ignore echo messages (sent by our page)
            message = event.get("message", {})
            if not message or message.get("is_echo"):
                continue

            message_id = message.get("mid")
            text = (message.get("text") or "").strip()
            sender_id = event.get("sender", {}).get("id")

            # Skip non-text messages (images, stickers, etc.)
            if not sender_id or not text or not message_id:
                continue

            # Step 1: Look up or create lead by fb_user_id
            existing = (
                db.table("leads")
                .select("id,score,segment,deleted_at,ai_enabled")
                .eq("fb_user_id", sender_id)
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
                    logger.info(f"Restored soft-deleted Facebook lead {lead_id}")
            else:
                name = f"Facebook User {sender_id[:6]}"
                new_lead = db.table("leads").insert({
                    "name": name,
                    "fb_user_id": sender_id,
                    "fb_page_id": page_id,
                    "source": "facebook",
                    "score": 5,
                    "segment": "C",
                    "tenant_id": tenant_id,
                }).execute()

                if not new_lead.data:
                    logger.error(f"Failed to create new Facebook lead for sender {sender_id}")
                    continue

                lead_id = new_lead.data[0]["id"]
                record_stage_event(
                    lead_id,
                    to_segment="C",
                    event_type="created",
                    metadata={"source": "facebook"},
                    tenant_id=tenant_id,
                    db=db,
                )
                try:
                    from app.services.assignment import auto_assign_lead
                    auto_assign_lead(lead_id, tenant_id)
                except Exception as e:
                    logger.warning(f"Auto-assign failed for Facebook lead {lead_id}: {e}")
                fire_trigger(background_tasks, lead_id, tenant_id, "lead_created", db=db)

            # Step 2: Prevent duplicate message insertion
            already = (
                db.table("messages")
                .select("id")
                .eq("fb_message_id", str(message_id))
                .eq("tenant_id", tenant_id)
                .limit(1)
                .execute()
            )
            if already.data:
                continue

            # Step 3: Insert inbound message
            _is_first = (
                db.table("messages").select("id").eq("lead_id", lead_id)
                .eq("direction", "inbound").limit(1).execute()
            )
            is_first_message = not bool(_is_first.data)
            db.table("messages").insert({
                "lead_id": lead_id,
                "direction": "inbound",
                "channel": "facebook",
                "content": text,
                "is_ai_generated": False,
                "fb_message_id": str(message_id),
                "tenant_id": tenant_id,
            }).execute()

            # Bot Flow: a flow run waiting on this lead's reply owns this message —
            # capture it and skip both the trigger fan-out and the AI reply below.
            if text:
                from app.services.flow_runtime import resume_for_inbound
                if await resume_for_inbound(lead_id, tenant_id, text, db):
                    continue

            fire_trigger(
                background_tasks, lead_id, tenant_id,
                "new_message_received", message=text,
                is_first_message=is_first_message, db=db,
            )

            # Step 4: Update conversation activity state
            try:
                from app.services.booking_flow import get_or_create_state
                conv_state = get_or_create_state(lead_id, tenant_id, db)
                new_count = (conv_state.get("message_count") or 0) + 1
                db.table("lead_conversation_state").update({
                    "message_count": new_count,
                    "last_activity_at": datetime.now(timezone.utc).isoformat(),
                }).eq("lead_id", lead_id).execute()
            except Exception as state_err:
                logger.warning(f"Failed to update Facebook lead conversation state: {state_err}")

            # Step 5: Queue AI Auto-Reply
            try:
                from app.services.context_builder import build_scorer_context
                context_block = build_scorer_context(lead_id, db)
                background_tasks.add_task(
                    generate_reply,
                    lead_id=lead_id,
                    message=text,
                    channel="facebook",
                    context_block=context_block,
                    fb_user_id=sender_id,
                )
            except Exception as reply_err:
                logger.error(f"Failed to queue generate_reply for Facebook lead {lead_id}: {reply_err}")

    return {"status": "ok"}
