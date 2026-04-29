import logging

from fastapi import APIRouter, Depends, Query

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.ai_reply import generate_reengagement_message, send_whatsapp
from app.services.growth import build_follow_up_summary, utcnow

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/summary")
async def summary(tenant_id: str = Depends(get_tenant_id)):
    return build_follow_up_summary()


@router.post("/run")
async def run_due_follow_ups(limit: int = Query(20, ge=1, le=100), tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    now = utcnow().isoformat()
    jobs = (
        db.table("follow_up_jobs")
        .select("*")
        .eq("status", "pending")
        .eq("tenant_id", tenant_id)
        .lte("scheduled_for", now)
        .order("scheduled_for")
        .limit(limit)
        .execute()
        .data
        or []
    )

    processed = 0
    sent = 0
    failed = 0
    skipped = 0

    for job in jobs:
        processed += 1
        lead = (
            db.table("leads")
            .select("id,name,phone,segment,converted_at,ai_enabled")
            .eq("id", job["lead_id"])
            .eq("tenant_id", tenant_id)
            .maybe_single()
            .execute()
        )
        lead_data = lead.data or {}
        if (
            not lead_data
            or lead_data.get("converted_at")
            or not lead_data.get("ai_enabled", True)
            or not lead_data.get("phone")
            or (lead_data.get("segment") or "D") not in {"A", "B"}
        ):
            db.table("follow_up_jobs").update(
                {
                    "status": "skipped",
                    "skip_reason": "Lead no longer eligible for automated re-engagement.",
                }
            ).eq("id", job["id"]).execute()
            skipped += 1
            continue

        try:
            message = generate_reengagement_message(job["lead_id"], job["cadence"])
            sid = await send_whatsapp(lead_data["phone"], message)
            if not sid:
                raise RuntimeError("Channel send failed")
            db.table("messages").insert(
                {
                    "lead_id": job["lead_id"],
                    "tenant_id": tenant_id,
                    "direction": "outbound",
                    "channel": "whatsapp",
                    "content": message,
                    "is_ai_generated": True,
                    "meta_message_id": sid,
                }
            ).execute()
            db.table("follow_up_jobs").update(
                {
                    "status": "sent",
                    "sent_at": utcnow().isoformat(),
                    "message_preview": message,
                    "last_error": None,
                    "skip_reason": None,
                }
            ).eq("id", job["id"]).execute()
            sent += 1
        except Exception as exc:
            logger.error("Follow-up job %s failed: %s", job["id"], exc)
            db.table("follow_up_jobs").update(
                {
                    "status": "failed",
                    "last_error": str(exc),
                }
            ).eq("id", job["id"]).execute()
            failed += 1

    return {
        "processed": processed,
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
        "summary": build_follow_up_summary(db=db),
    }
