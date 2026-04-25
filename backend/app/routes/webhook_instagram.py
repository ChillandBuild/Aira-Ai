import logging
from fastapi import APIRouter, HTTPException, Query, Request, Response
from app.config import settings
from app.db.supabase import get_supabase
from app.services.growth import record_stage_event

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def verify(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
):
    """Meta verification handshake for the webhook."""
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_verify_token:
        return Response(content=hub_challenge or "", media_type="text/plain")
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("")
async def instagram_webhook(request: Request):
    payload = await request.json()
    db = get_supabase()
    logger.info(f"Instagram webhook payload: {payload}")

    for entry in payload.get("entry", []):
        for msg_event in entry.get("messaging", []) or []:
            sender = (msg_event.get("sender") or {}).get("id")
            message = msg_event.get("message") or {}
            if message.get("is_echo"):
                continue
            text = message.get("text")
            if not sender or not text:
                continue

            existing = db.table("leads").select("id,score,segment").eq("ig_user_id", sender).limit(1).execute()
            if existing.data:
                lead_id = existing.data[0]["id"]
            else:
                new_lead = db.table("leads").insert({
                    "ig_user_id": sender,
                    "source": "instagram",
                    "score": 5,
                    "segment": "C",
                }).execute()
                lead_id = new_lead.data[0]["id"]
                record_stage_event(
                    lead_id,
                    to_segment="C",
                    event_type="created",
                    metadata={"source": "instagram"},
                    db=db,
                )

            db.table("messages").insert({
                "lead_id": lead_id,
                "direction": "inbound",
                "channel": "instagram",
                "content": text,
                "is_ai_generated": False,
            }).execute()

            try:
                from app.services.ai_reply import generate_reply
                await generate_reply(
                    lead_id=lead_id,
                    message=text,
                    channel="instagram",
                    ig_user_id=sender,
                )
            except Exception as e:
                logger.error(f"Instagram AI reply failed for lead {lead_id}: {e}")

    return {"status": "ok"}
