import csv
import io
import logging
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.models.schemas import Lead, LeadUpdate, LeadWithMessages, Message, PaginatedResponse
from app.services.ai_reply import send_whatsapp, send_instagram
from app.services.growth import record_stage_event, sync_follow_up_jobs

logger = logging.getLogger(__name__)
router = APIRouter()


class ConvertPayload(BaseModel):
    notes: str | None = None


class AiToggle(BaseModel):
    enabled: bool


class HumanMessage(BaseModel):
    content: str

@router.get("/", response_model=PaginatedResponse)
async def list_leads(
    segment: str | None = Query(None, pattern="^[ABCD]$"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
):
    db = get_supabase()
    offset = (page - 1) * limit
    query = db.table("leads").select("*", count="exact")
    if segment:
        query = query.eq("segment", segment)
    result = query.order("score", desc=True).range(offset, offset + limit - 1).execute()
    return PaginatedResponse(
        data=result.data,
        total=result.count or 0,
        page=page,
        limit=limit,
    )

@router.get("/export")
async def export_leads(
    segment: str | None = Query(None, pattern="^[ABCD]$"),
):
    db = get_supabase()
    query = db.table("leads").select("id,phone,name,source,score,segment,notes,created_at")
    if segment:
        query = query.eq("segment", segment)
    result = query.order("score", desc=True).execute()
    leads = result.data or []

    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=["id","phone","name","source","score","segment","notes","created_at"])
    writer.writeheader()
    writer.writerows(leads)

    filename = f"leads_{segment or 'all'}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode()),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

@router.get("/{lead_id}/messages", response_model=list[Message])
async def get_lead_messages(lead_id: UUID):
    db = get_supabase()
    result = db.table("messages").select("*").eq("lead_id", str(lead_id)).order("created_at").execute()
    return result.data or []

@router.get("/{lead_id}", response_model=LeadWithMessages)
async def get_lead(lead_id: UUID):
    db = get_supabase()
    lead_result = db.table("leads").select("*").eq("id", str(lead_id)).maybe_single().execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    msgs_result = db.table("messages").select("*").eq("lead_id", str(lead_id)).order("created_at").execute()
    lead = lead_result.data
    lead["messages"] = msgs_result.data or []
    return lead

@router.patch("/{lead_id}", response_model=Lead)
async def update_lead(lead_id: UUID, updates: LeadUpdate):
    db = get_supabase()
    existing = (
        db.table("leads")
        .select("segment,phone,ai_enabled,converted_at")
        .eq("id", str(lead_id))
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    update_data = updates.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = db.table("leads").update(update_data).eq("id", str(lead_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    updated = result.data[0]
    if updated.get("segment") != existing.data.get("segment"):
        record_stage_event(
            str(lead_id),
            from_segment=existing.data.get("segment"),
            to_segment=updated.get("segment") or existing.data.get("segment") or "C",
            event_type="manual_update",
            metadata={"source": "dashboard"},
            db=db,
        )
    sync_follow_up_jobs(
        str(lead_id),
        segment=updated.get("segment"),
        phone=updated.get("phone") or existing.data.get("phone"),
        converted_at=updated.get("converted_at"),
        ai_enabled=updated.get("ai_enabled", existing.data.get("ai_enabled", True)),
        reason="manual_update",
        db=db,
    )
    return updated

@router.post("/{lead_id}/convert", response_model=Lead)
async def mark_converted(lead_id: UUID, payload: ConvertPayload | None = None):
    db = get_supabase()
    existing = (
        db.table("leads")
        .select("segment,phone,ai_enabled")
        .eq("id", str(lead_id))
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    notes = (payload.notes if payload else None) or None
    update = {
        "converted_at": datetime.now(timezone.utc).isoformat(),
        "segment": "A",
    }
    if notes:
        update["conversion_notes"] = notes
    result = db.table("leads").update(update).eq("id", str(lead_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    updated = result.data[0]
    record_stage_event(
        str(lead_id),
        from_segment=existing.data.get("segment"),
        to_segment="A",
        event_type="converted",
        metadata={"notes": notes} if notes else {},
        db=db,
    )
    sync_follow_up_jobs(
        str(lead_id),
        segment="A",
        phone=updated.get("phone") or existing.data.get("phone"),
        converted_at=updated.get("converted_at"),
        ai_enabled=updated.get("ai_enabled", existing.data.get("ai_enabled", True)),
        reason="converted",
        db=db,
    )
    return updated


@router.patch("/{lead_id}/ai", response_model=Lead)
async def toggle_ai(lead_id: UUID, payload: AiToggle):
    db = get_supabase()
    existing = (
        db.table("leads")
        .select("segment,phone,converted_at")
        .eq("id", str(lead_id))
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    result = db.table("leads").update({"ai_enabled": payload.enabled}).eq("id", str(lead_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    updated = result.data[0]
    sync_follow_up_jobs(
        str(lead_id),
        segment=updated.get("segment") or existing.data.get("segment"),
        phone=updated.get("phone") or existing.data.get("phone"),
        converted_at=updated.get("converted_at") or existing.data.get("converted_at"),
        ai_enabled=payload.enabled,
        reason="ai_toggle",
        db=db,
    )
    return updated


@router.post("/{lead_id}/send")
async def send_human_message(lead_id: UUID, payload: HumanMessage):
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message is empty")

    db = get_supabase()
    lead = db.table("leads").select("phone,source,ig_user_id").eq("id", str(lead_id)).maybe_single().execute()
    if not lead.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    source = lead.data.get("source")
    channel = "instagram" if source == "instagram" else "whatsapp"
    sid: str | None = None
    if channel == "instagram":
        ig_id = lead.data.get("ig_user_id")
        if not ig_id:
            raise HTTPException(status_code=400, detail="Instagram lead missing ig_user_id")
        sid = send_instagram(ig_id, content)
    else:
        phone = lead.data.get("phone")
        if not phone:
            raise HTTPException(status_code=400, detail="Lead has no phone number")
        sid = await send_whatsapp(phone, content)

    if not sid:
        raise HTTPException(status_code=502, detail="Channel send failed — check backend logs")

    sid_field = "meta_message_id" if channel == "whatsapp" else "twilio_message_sid"
    row = db.table("messages").insert({
        "lead_id": str(lead_id),
        "direction": "outbound",
        "channel": channel,
        "content": content,
        "is_ai_generated": False,
        sid_field: sid,
    }).execute()
    return row.data[0] if row.data else {"sent": True, "sid": sid}


@router.delete("/{lead_id}")
async def delete_lead(lead_id: UUID):
    db = get_supabase()
    db.table("leads").delete().eq("id", str(lead_id)).execute()
    return {"success": True, "message": "Lead deleted"}
