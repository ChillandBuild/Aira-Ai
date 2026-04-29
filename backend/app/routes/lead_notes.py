import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateNote(BaseModel):
    content: str
    caller_id: str | None = None
    call_log_id: str | None = None
    is_pinned: bool = False
    structured: dict = {}


class UpdateNote(BaseModel):
    content: str | None = None
    is_pinned: bool | None = None
    structured: dict | None = None


@router.get("/{lead_id}")
async def get_lead_notes(lead_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("lead_notes")
        .select("*")
        .eq("lead_id", str(lead_id))
        .eq("tenant_id", tenant_id)
        .order("is_pinned", desc=True)
        .order("created_at", desc=True)
        .execute()
    )
    rows = result.data or []
    pinned = [r for r in rows if r.get("is_pinned")]
    notes = [r for r in rows if not r.get("is_pinned")]
    return {"pinned": pinned, "notes": notes}


@router.post("/{lead_id}")
async def create_lead_note(lead_id: UUID, payload: CreateNote, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    insert_data = {
        "lead_id": str(lead_id),
        "tenant_id": tenant_id,
        "content": payload.content,
        "is_pinned": payload.is_pinned,
        "structured": payload.structured,
    }
    if payload.caller_id is not None:
        insert_data["caller_id"] = payload.caller_id
    if payload.call_log_id is not None:
        insert_data["call_log_id"] = payload.call_log_id
    result = db.table("lead_notes").insert(insert_data).execute()
    return result.data[0]


@router.patch("/note/{note_id}")
async def update_lead_note(note_id: UUID, payload: UpdateNote, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    updates = {}
    if payload.content is not None:
        updates["content"] = payload.content
    if payload.is_pinned is not None:
        updates["is_pinned"] = payload.is_pinned
    if payload.structured is not None:
        updates["structured"] = payload.structured
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = db.table("lead_notes").update(updates).eq("id", str(note_id)).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Note not found")
    return result.data[0]


@router.delete("/note/{note_id}")
async def delete_lead_note(note_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("lead_notes").delete().eq("id", str(note_id)).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"deleted": True}
