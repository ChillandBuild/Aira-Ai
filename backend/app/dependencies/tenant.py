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
            detail="No tenant associated with this account.",
        )
    return {"tenant_id": result.data["tenant_id"], "role": result.data["role"]}
