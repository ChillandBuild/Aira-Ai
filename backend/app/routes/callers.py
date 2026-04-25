import logging
from uuid import UUID
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.services.call_coach import coaching_tip

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateCaller(BaseModel):
    name: str
    phone: str


class UpdateCaller(BaseModel):
    name: str | None = None
    phone: str | None = None


@router.post("/")
async def create_caller(payload: CreateCaller):
    db = get_supabase()
    result = db.table("callers").insert({
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "active": True,
        "overall_score": 7.0,
    }).execute()
    return result.data[0]


@router.get("/")
async def list_callers():
    db = get_supabase()
    callers = db.table("callers").select("*").eq("active", True).order("overall_score", desc=True).execute()
    return {"data": callers.data or []}


@router.patch("/{caller_id}")
async def update_caller(caller_id: UUID, payload: UpdateCaller):
    db = get_supabase()
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = db.table("callers").update(updates).eq("id", str(caller_id)).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Caller not found")
    return result.data[0]


@router.delete("/{caller_id}")
async def delete_caller(caller_id: UUID):
    db = get_supabase()
    db.table("callers").update({"active": False}).eq("id", str(caller_id)).execute()
    return {"deleted": True}


@router.get("/{caller_id}/logs")
async def list_caller_logs(caller_id: UUID):
    db = get_supabase()
    result = (
        db.table("call_logs")
        .select("id,lead_id,duration_seconds,outcome,recording_url,score,status,created_at")
        .eq("caller_id", str(caller_id))
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"data": result.data or []}


@router.get("/{caller_id}/coaching")
async def get_coaching(caller_id: UUID):
    db = get_supabase()
    caller = db.table("callers").select("id").eq("id", str(caller_id)).maybe_single().execute()
    if not caller.data:
        raise HTTPException(status_code=404, detail="Caller not found")
    tip = await coaching_tip(str(caller_id))
    return {"caller_id": str(caller_id), "tip": tip}
