from fastapi import Depends, HTTPException, status
from app.db.supabase import get_supabase
from app.dependencies.auth import get_current_user


def get_system_admin(user: dict = Depends(get_current_user)) -> dict:
    db = get_supabase()
    result = (
        db.table("system_admins")
        .select("user_id")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="System admin access required.",
        )
    return user
