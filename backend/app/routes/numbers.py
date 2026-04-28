import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


class CreatePhoneNumber(BaseModel):
    provider: str
    number: str
    display_name: str
    meta_phone_number_id: str | None = None
    api_key: str | None = None


class UpdatePhoneNumber(BaseModel):
    role: str | None = None
    status: str | None = None
    display_name: str | None = None
    paused_outbound: bool | None = None
    warm_up_day: int | None = None


@router.get("/")
async def list_phone_numbers(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("phone_numbers")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("role")
        .order("quality_rating")
        .execute()
    )
    return {"data": result.data or []}


@router.post("/")
async def create_phone_number(payload: CreatePhoneNumber, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    insert_data = {
        "provider": payload.provider,
        "number": payload.number.strip(),
        "display_name": payload.display_name.strip(),
        "role": "standby",
        "status": "warming",
        "warm_up_day": 0,
        "paused_outbound": False,
        "tenant_id": tenant_id,
    }
    if payload.meta_phone_number_id is not None:
        insert_data["meta_phone_number_id"] = payload.meta_phone_number_id
    if payload.api_key is not None:
        insert_data["api_key"] = payload.api_key
    result = db.table("phone_numbers").insert(insert_data).execute()
    return result.data[0]


@router.patch("/{number_id}")
async def update_phone_number(number_id: UUID, payload: UpdatePhoneNumber, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    updates = {}
    if payload.role is not None:
        updates["role"] = payload.role
    if payload.status is not None:
        updates["status"] = payload.status
    if payload.display_name is not None:
        updates["display_name"] = payload.display_name.strip()
    if payload.paused_outbound is not None:
        updates["paused_outbound"] = payload.paused_outbound
    if payload.warm_up_day is not None:
        updates["warm_up_day"] = payload.warm_up_day
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = db.table("phone_numbers").update(updates).eq("id", str(number_id)).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Phone number not found")
    return result.data[0]


@router.delete("/{number_id}")
async def delete_phone_number(number_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    active_result = (
        db.table("phone_numbers")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("status", "active")
        .execute()
    )
    active_ids = [row["id"] for row in (active_result.data or [])]
    if len(active_ids) == 1 and active_ids[0] == str(number_id):
        raise HTTPException(status_code=400, detail="Cannot delete last active number")
    db.table("phone_numbers").update({"status": "archived", "role": "archived"}).eq("id", str(number_id)).eq("tenant_id", tenant_id).execute()
    return {"deleted": True}
