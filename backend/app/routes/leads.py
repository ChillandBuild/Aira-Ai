import csv
import io
import logging
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id, get_tenant_and_role
from app.models.schemas import Lead, LeadUpdate, LeadWithMessages, Message, PaginatedResponse
from app.services.ai_reply import send_whatsapp, send_instagram, get_last_send_error
from app.services.growth import record_stage_event, sync_follow_up_jobs

logger = logging.getLogger(__name__)
router = APIRouter()


class ConvertPayload(BaseModel):
    notes: str | None = None


class AiToggle(BaseModel):
    enabled: bool


class HumanMessage(BaseModel):
    content: str


class AssignPayload(BaseModel):
    caller_id: str | None = None


@router.get("/", response_model=PaginatedResponse)
async def list_leads(
    segment: str | None = Query(None, pattern="^[ABCD]$"),
    assigned_to: str | None = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    ctx: dict = Depends(get_tenant_and_role),
):
    db = get_supabase()
    tenant_id = ctx["tenant_id"]
    offset = (page - 1) * limit
    query = db.table("leads").select("*", count="exact").eq("tenant_id", tenant_id).is_("deleted_at", "null")
    if segment:
        query = query.eq("segment", segment)
    if assigned_to:
        query = query.eq("assigned_to", assigned_to)
    elif ctx.get("role") == "caller" and ctx.get("caller_id"):
        query = query.eq("assigned_to", ctx["caller_id"])
    result = query.order("score", desc=True).range(offset, offset + limit - 1).execute()
    return PaginatedResponse(
        data=result.data,
        total=result.count or 0,
        page=page,
        limit=limit,
    )


@router.patch("/{lead_id}/assign")
async def assign_lead(
    lead_id: str,
    payload: AssignPayload,
    ctx: dict = Depends(get_tenant_and_role),
):
    if ctx["role"] != "owner":
        raise HTTPException(status_code=403, detail="Owner only")
    db = get_supabase()
    db.table("leads").update({"assigned_to": payload.caller_id}).eq(
        "id", lead_id
    ).eq("tenant_id", ctx["tenant_id"]).execute()
    return {"success": True}

@router.get("/export")
async def export_leads(
    segment: str | None = Query(None, pattern="^[ABCD]$"),
    tenant_id: str = Depends(get_tenant_id),
):
    db = get_supabase()
    query = db.table("leads").select("id,phone,name,source,score,segment,notes,created_at").eq("tenant_id", tenant_id).is_("deleted_at", "null")
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
async def get_lead_messages(lead_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("messages").select("*").eq("lead_id", str(lead_id)).eq("tenant_id", tenant_id).order("created_at").execute()
    return result.data or []

@router.get("/{lead_id}", response_model=LeadWithMessages)
async def get_lead(lead_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    lead_result = db.table("leads").select("*").eq("id", str(lead_id)).eq("tenant_id", tenant_id).is_("deleted_at", "null").maybe_single().execute()
    if not lead_result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    msgs_result = db.table("messages").select("*").eq("lead_id", str(lead_id)).eq("tenant_id", tenant_id).order("created_at").execute()
    lead = lead_result.data
    lead["messages"] = msgs_result.data or []
    return lead

@router.patch("/{lead_id}", response_model=Lead)
async def update_lead(lead_id: UUID, updates: LeadUpdate, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    existing = (
        db.table("leads")
        .select("segment,phone,ai_enabled,converted_at")
        .eq("id", str(lead_id))
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    update_data = updates.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = db.table("leads").update(update_data).eq("id", str(lead_id)).eq("tenant_id", tenant_id).execute()
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
            tenant_id=tenant_id,
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
async def mark_converted(lead_id: UUID, payload: ConvertPayload | None = None, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    existing = (
        db.table("leads")
        .select("segment,phone,ai_enabled")
        .eq("id", str(lead_id))
        .eq("tenant_id", tenant_id)
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
    result = db.table("leads").update(update).eq("id", str(lead_id)).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    updated = result.data[0]
    record_stage_event(
        str(lead_id),
        from_segment=existing.data.get("segment"),
        to_segment="A",
        event_type="converted",
        metadata={"notes": notes} if notes else {},
        tenant_id=tenant_id,
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
async def toggle_ai(lead_id: UUID, payload: AiToggle, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    existing = (
        db.table("leads")
        .select("segment,phone,converted_at")
        .eq("id", str(lead_id))
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    result = db.table("leads").update({"ai_enabled": payload.enabled}).eq("id", str(lead_id)).eq("tenant_id", tenant_id).select("*").execute()
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
async def send_human_message(lead_id: UUID, payload: HumanMessage, tenant_id: str = Depends(get_tenant_id)):
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message is empty")

    db = get_supabase()
    lead = db.table("leads").select("phone,source,ig_user_id").eq("id", str(lead_id)).eq("tenant_id", tenant_id).maybe_single().execute()
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
        meta_err = get_last_send_error() or "unknown error"
        raise HTTPException(status_code=502, detail=f"Channel send failed: {meta_err}")

    sid_field = "meta_message_id" if channel == "whatsapp" else "twilio_message_sid"
    row = db.table("messages").insert({
        "lead_id": str(lead_id),
        "tenant_id": tenant_id,
        "direction": "outbound",
        "channel": channel,
        "content": content,
        "is_ai_generated": False,
        sid_field: sid,
    }).execute()
    
    # Clear needs_human_intervention flag
    db.table("leads").update({"needs_human_intervention": False}).eq("id", str(lead_id)).execute()
    
    return row.data[0] if row.data else {"sent": True, "sid": sid}


class ComposeMessage(BaseModel):
    phone: str
    content: str
    name: str | None = None


@router.post("/compose")
async def compose_new_message(payload: ComposeMessage, tenant_id: str = Depends(get_tenant_id)):
    """Send a WhatsApp message to any phone — creates lead if it doesn't exist."""
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message is empty")

    phone = payload.phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = "+" + phone
    if len(phone) < 8:
        raise HTTPException(status_code=400, detail="Invalid phone number")

    db = get_supabase()
    existing = db.table("leads").select("id").eq("phone", phone).eq("tenant_id", tenant_id).limit(1).execute()
    if existing.data:
        lead_id = existing.data[0]["id"]
        if payload.name:
            db.table("leads").update({"name": payload.name}).eq("id", lead_id).eq("tenant_id", tenant_id).execute()
    else:
        insert_data = {"phone": phone, "source": "manual", "score": 5, "segment": "C", "tenant_id": tenant_id}
        if payload.name:
            insert_data["name"] = payload.name
        new_lead = db.table("leads").insert(insert_data).execute()
        lead_id = new_lead.data[0]["id"]
        record_stage_event(lead_id, to_segment="C", event_type="created", metadata={"source": "manual"}, tenant_id=tenant_id, db=db)

    sid = await send_whatsapp(phone, content)
    if not sid:
        meta_err = get_last_send_error() or "unknown error"
        # Note: outside 24h window, freeform text fails — Meta requires templates
        raise HTTPException(
            status_code=502,
            detail=(
                f"Send failed: {meta_err}. "
                "If recipient hasn't messaged you in 24h, you must use an approved template."
            ),
        )

    db.table("messages").insert({
        "lead_id": lead_id,
        "tenant_id": tenant_id,
        "direction": "outbound",
        "channel": "whatsapp",
        "content": content,
        "is_ai_generated": False,
        "meta_message_id": sid,
    }).execute()
    return {"lead_id": lead_id, "sid": sid, "phone": phone}


@router.delete("/{lead_id}/clear-chat")
async def clear_chat(lead_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    """Delete all messages for a lead and reset AI to enabled. The lead itself is preserved."""
    db = get_supabase()
    # Verify the lead belongs to this tenant
    lead = db.table("leads").select("id").eq("id", str(lead_id)).eq("tenant_id", tenant_id).maybe_single().execute()
    if not lead.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Hard-delete all messages for this lead
    db.table("messages").delete().eq("lead_id", str(lead_id)).execute()
    # Re-enable AI so the bot picks up from a fresh start
    db.table("leads").update({"ai_enabled": True}).eq("id", str(lead_id)).execute()
    return {"success": True, "message": "Chat cleared"}


@router.delete("/{lead_id}")
async def delete_lead(lead_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    result = db.table("leads").update({"deleted_at": now, "ai_enabled": False}).eq("id", str(lead_id)).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    db.table("follow_up_jobs").update({"status": "skipped", "skip_reason": "Lead deleted."}).eq("lead_id", str(lead_id)).eq("status", "pending").execute()
    return {"success": True, "message": "Lead deleted"}

@router.get("/{lead_id}/call-logs")
async def get_lead_call_logs(lead_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("call_logs")
        .select("id,call_sid,status,outcome,duration_seconds,recording_url,score,ai_summary,transcript,created_at,callers(name)")
        .eq("lead_id", str(lead_id))
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return {"data": result.data or []}
