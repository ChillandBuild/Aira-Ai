import logging
from fastapi import Depends, HTTPException, status

from app.db.supabase import get_supabase
from app.dependencies.auth import get_current_user

logger = logging.getLogger(__name__)


def get_tenant_id(user: dict = Depends(get_current_user)) -> str:
    db = get_supabase()
    result = (
        db.table("tenant_users")
        .select("tenant_id, role")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant associated with this account. Complete onboarding first.",
        )
    tenant_id = result.data["tenant_id"]
    tenant = (
        db.table("tenants")
        .select("status")
        .eq("id", tenant_id)
        .maybe_single()
        .execute()
    )
    if (tenant.data or {}).get("status") == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended.")
    return tenant_id


def get_tenant_and_role(user: dict = Depends(get_current_user)) -> dict:
    from app.services.assignment import get_caller_id_for_user
    db = get_supabase()
    result = (
        db.table("tenant_users")
        .select("tenant_id, role")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tenant associated with this account.",
        )
    tenant_id = result.data["tenant_id"]
    role = result.data["role"]
    tenant = (
        db.table("tenants")
        .select("status")
        .eq("id", tenant_id)
        .maybe_single()
        .execute()
    )
    if (tenant.data or {}).get("status") == "suspended":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended.")
    caller_id = get_caller_id_for_user(user["user_id"], tenant_id) if role == "caller" else None
    return {
        "tenant_id": tenant_id,
        "role": role,
        "user_id": user["user_id"],
        "caller_id": caller_id,
    }


def require_owner(ctx: dict = Depends(get_tenant_and_role)) -> dict:
    if ctx.get("role") != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization owner privileges required."
        )
    return ctx

