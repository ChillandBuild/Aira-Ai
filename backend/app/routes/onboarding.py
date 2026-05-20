import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db.supabase import get_supabase
from app.dependencies.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateTenantPayload(BaseModel):
    name: str


@router.post("/")
def create_tenant(payload: CreateTenantPayload, user: dict = Depends(get_current_user)):
    db = get_supabase()
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Tenant name is required")

    existing = (
        db.table("tenant_users")
        .select("tenant_id")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if existing and existing.data:
        return {"tenant_id": existing.data["tenant_id"], "already_exists": True}

    tenant = db.table("tenants").insert({"name": name}).execute()
    tenant_id = tenant.data[0]["id"]

    db.table("tenant_users").insert({
        "tenant_id": tenant_id,
        "user_id": user["user_id"],
        "role": "owner",
    }).execute()

    logger.info(f"Tenant created: {tenant_id} for user {user['user_id']}")
    return {"tenant_id": tenant_id, "already_exists": False}


@router.get("/status")
def tenant_status(user: dict = Depends(get_current_user)):
    db = get_supabase()
    result = (
        db.table("tenant_users")
        .select("tenant_id, role")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    admin = (
        db.table("system_admins")
        .select("user_id")
        .eq("user_id", user["user_id"])
        .limit(1)
        .execute()
    )
    is_system_admin = bool(admin and admin.data)

    if not result or not result.data:
        return {"has_tenant": False, "is_system_admin": is_system_admin}
    return {
        "has_tenant": True,
        "tenant_id": result.data["tenant_id"],
        "role": result.data["role"],
        "is_system_admin": is_system_admin,
    }
