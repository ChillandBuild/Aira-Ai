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
    return result.data["tenant_id"]


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
    caller_id = get_caller_id_for_user(user["user_id"], tenant_id) if role == "caller" else None
    return {
        "tenant_id": tenant_id,
        "role": role,
        "user_id": user["user_id"],
        "caller_id": caller_id,
    }
