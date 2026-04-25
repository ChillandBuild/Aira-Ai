import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, Path
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.services.ai_reply import send_whatsapp

logger = logging.getLogger(__name__)
router = APIRouter()

SEGMENTS = ("A", "B", "C", "D")


class TemplateUpdate(BaseModel):
    message: str
    enabled: bool = True


def _ensure_templates(db) -> list[dict]:
    existing = db.table("segment_templates").select("*").execute()
    present = {r["segment"] for r in (existing.data or [])}
    missing = [{"segment": s, "message": "", "enabled": True} for s in SEGMENTS if s not in present]
    if missing:
        db.table("segment_templates").insert(missing).execute()
        existing = db.table("segment_templates").select("*").execute()
    return sorted(existing.data or [], key=lambda r: r["segment"])


@router.get("/templates")
async def list_templates():
    db = get_supabase()
    return {"data": _ensure_templates(db)}


@router.put("/templates/{segment}")
async def upsert_template(
    updates: TemplateUpdate,
    segment: str = Path(pattern="^[ABCD]$"),
):
    db = get_supabase()
    _ensure_templates(db)
    result = (
        db.table("segment_templates")
        .update({"message": updates.message, "enabled": updates.enabled})
        .eq("segment", segment)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Template not found")
    return result.data[0]


@router.post("/{segment}/broadcast")
async def broadcast_to_segment(segment: str = Path(pattern="^[ABCD]$")):
    db = get_supabase()

    tpl = db.table("segment_templates").select("*").eq("segment", segment).limit(1).execute()
    if not tpl.data or not (tpl.data[0].get("message") or "").strip():
        raise HTTPException(status_code=400, detail="Template is empty — save a message first")
    if not tpl.data[0].get("enabled"):
        raise HTTPException(status_code=400, detail="Template is disabled")
    message = tpl.data[0]["message"]

    leads = db.table("leads").select("id,phone").eq("segment", segment).execute()
    targets = leads.data or []
    if not targets:
        return {"sent": 0, "failed": 0, "skipped_window": 0, "total": 0}

    # WhatsApp 24h rule: only free-form to leads with an inbound msg in the last 24h.
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    lead_ids = [t["id"] for t in targets]
    recent = (
        db.table("messages")
        .select("lead_id")
        .eq("direction", "inbound")
        .gte("created_at", cutoff)
        .in_("lead_id", lead_ids)
        .execute()
    )
    eligible_ids = {r["lead_id"] for r in (recent.data or [])}

    sent = 0
    failed = 0
    skipped_window = 0
    for t in targets:
        if t["id"] not in eligible_ids:
            skipped_window += 1
            continue
        sid = send_whatsapp(t["phone"], message)
        if sid:
            sent += 1
            db.table("messages").insert({
                "lead_id": t["id"],
                "direction": "outbound",
                "channel": "whatsapp",
                "content": message,
                "is_ai_generated": False,
                "twilio_message_sid": sid,
            }).execute()
        else:
            failed += 1

    return {
        "total": len(targets),
        "sent": sent,
        "failed": failed,
        "skipped_window": skipped_window,
    }
