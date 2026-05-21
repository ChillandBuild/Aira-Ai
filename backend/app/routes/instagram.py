import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException, Response
from app.db.supabase import get_supabase
from app.config import settings
from app.config_dynamic import get_setting
from app.services.growth import record_stage_event
from app.services.ai_reply import generate_reply
from app.services.meta_webhook_verify import verify_meta_signature, resolve_tenant_for_page

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{tenant_id}")
async def verify_instagram_webhook(tenant_id: str, request: Request):
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge")

    # Retrieve tenant-specific webhook verify token or fallback to global setting
    verify_token = get_setting("meta_webhook_verify_token", tenant_id=tenant_id) or settings.meta_verify_token

    if mode == "subscribe" and token == verify_token:
        logger.info(f"Instagram webhook verified successfully for tenant {tenant_id}")
        return Response(content=challenge, media_type="text/plain")

    logger.warning(f"Instagram webhook verification failed for tenant {tenant_id} — token mismatch. received={token}")
    return Response(content="Forbidden", status_code=403)


@router.post("/{tenant_id}")
async def instagram_webhook(tenant_id: str, request: Request, background_tasks: BackgroundTasks):
    raw_body = await request.body()
    signature = request.headers.get("X-Hub-Signature-256")
    if not verify_meta_signature(raw_body, signature, tenant_id):
        logger.warning(f"Instagram webhook signature invalid for tenant {tenant_id}")
        return Response(content="Forbidden", status_code=403)

    try:
        import json as _json
        payload = _json.loads(raw_body.decode("utf-8")) if raw_body else {}
    except Exception:
        logger.error("Failed to parse Instagram webhook request JSON")
        return {"status": "ok", "detail": "invalid_json"}

    # Meta webhook event payloads have "object": "instagram" and "entry" list
    if payload.get("object") != "instagram":
        return {"status": "ok", "detail": "not_instagram_object"}

    entries = payload.get("entry", [])
    db = get_supabase()

    for entry in entries:
        ig_account_id = entry.get("id", "")
        owner_tenant = resolve_tenant_for_page(ig_account_id, "instagram")
        if owner_tenant and owner_tenant != tenant_id:
            logger.warning(
                f"Instagram account {ig_account_id} belongs to tenant {owner_tenant}, "
                f"not {tenant_id} (URL) — skipping entry"
            )
            continue

        messaging = entry.get("messaging", [])
        for event in messaging:
            # We ignore echo messages (messages sent by our own application/page)
            message = event.get("message", {})
            if not message or message.get("is_echo"):
                continue

            message_id = message.get("mid")
            text = (message.get("text") or "").strip()
            sender_id = event.get("sender", {}).get("id")

            if not sender_id or not text or not message_id:
                continue

            # Step 1: Look up or create the lead by ig_user_id
            existing = (
                db.table("leads")
                .select("id,score,segment,deleted_at,ai_enabled")
                .eq("ig_user_id", sender_id)
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
                    logger.info(f"Restored soft-deleted Instagram lead {lead_id}")
            else:
                name = f"Instagram User {sender_id[:6]}"
                new_lead = db.table("leads").insert({
                    "name": name,
                    "ig_user_id": sender_id,
                    "source": "instagram",
                    "score": 5,
                    "segment": "C",
                    "tenant_id": tenant_id,
                }).execute()

                if not new_lead.data:
                    logger.error(f"Failed to create new Instagram lead for sender {sender_id}")
                    continue

                lead_id = new_lead.data[0]["id"]
                record_stage_event(
                    lead_id,
                    to_segment="C",
                    event_type="created",
                    metadata={"source": "instagram"},
                    tenant_id=tenant_id,
                    db=db
                )
                try:
                    from app.services.assignment import auto_assign_lead
                    auto_assign_lead(lead_id, tenant_id)
                except Exception as e:
                    logger.warning(f"Auto-assign failed for Instagram lead {lead_id}: {e}")

            # Step 2: Prevent duplicate message insertion
            already = (
                db.table("messages")
                .select("id")
                .eq("meta_message_id", str(message_id))
                .eq("tenant_id", tenant_id)
                .limit(1)
                .execute()
            )
            if already.data:
                continue

            # Step 3: Insert inbound message
            insert_row = {
                "lead_id": lead_id,
                "direction": "inbound",
                "channel": "instagram",
                "content": text,
                "is_ai_generated": False,
                "meta_message_id": str(message_id),
                "tenant_id": tenant_id,
            }
            db.table("messages").insert(insert_row).execute()

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
                logger.warning(f"Failed to update Instagram lead conversation state: {state_err}")

            # Step 5: Queue AI Auto-Reply
            try:
                from app.services.context_builder import build_scorer_context
                context_block = build_scorer_context(lead_id, db)
                background_tasks.add_task(
                    generate_reply,
                    lead_id=lead_id,
                    message=text,
                    channel="instagram",
                    context_block=context_block,
                    ig_user_id=sender_id
                )
            except Exception as reply_err:
                logger.error(f"Failed to queue generate_reply task for Instagram lead {lead_id}: {reply_err}")

    return {"status": "ok"}
