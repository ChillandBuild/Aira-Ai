import logging
from uuid import UUID
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateVoiceNumber(BaseModel):
    number: str
    display_name: str
    provider: str = "twilio"
    is_primary: bool = False


class UpdateVoiceNumber(BaseModel):
    display_name: str | None = None
    status: str | None = None
    is_primary: bool | None = None
    spam_score: int | None = None


@router.get("/")
async def list_voice_numbers(show_archived: bool = Query(False)):
    db = get_supabase()
    q = db.table("voice_numbers").select("*")
    if not show_archived:
        q = q.neq("status", "archived")
    result = q.order("spam_score").order("pickup_rate", desc=True).execute()
    return {"data": result.data or []}


@router.post("/")
async def create_voice_number(payload: CreateVoiceNumber):
    db = get_supabase()
    result = db.table("voice_numbers").insert({
        "number": payload.number.strip(),
        "display_name": payload.display_name.strip(),
        "provider": payload.provider,
        "is_primary": payload.is_primary,
    }).execute()
    return result.data[0]


@router.patch("/{number_id}")
async def update_voice_number(number_id: UUID, payload: UpdateVoiceNumber):
    db = get_supabase()
    updates = {}
    if payload.display_name is not None:
        updates["display_name"] = payload.display_name.strip()
    if payload.status is not None:
        updates["status"] = payload.status
    if payload.is_primary is not None:
        updates["is_primary"] = payload.is_primary
    if payload.spam_score is not None:
        updates["spam_score"] = payload.spam_score
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = db.table("voice_numbers").update(updates).eq("id", str(number_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Voice number not found")
    return result.data[0]


@router.delete("/{number_id}")
async def delete_voice_number(number_id: UUID):
    db = get_supabase()
    active_result = (
        db.table("voice_numbers")
        .select("id")
        .eq("status", "active")
        .execute()
    )
    active_ids = [row["id"] for row in (active_result.data or [])]
    if len(active_ids) == 1 and active_ids[0] == str(number_id):
        raise HTTPException(status_code=400, detail="Cannot delete last active number")
    db.table("voice_numbers").update({"status": "archived"}).eq("id", str(number_id)).execute()
    return {"deleted": True}
