import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.dependencies.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/")
async def list_notifications(
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_current_user)
):
    """Fetch unread notifications for the current user."""
    db = get_supabase()
    
    rows = (
        db.table("app_notifications")
        .select("*")
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
        .eq("is_read", False)
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    
    return {"data": rows.data or []}

@router.patch("/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    tenant_id: str = Depends(get_tenant_id),
    user_id: str = Depends(get_current_user)
):
    """Mark a specific notification as read."""
    db = get_supabase()
    
    row = (
        db.table("app_notifications")
        .update({"is_read": True})
        .eq("id", notification_id)
        .eq("tenant_id", tenant_id)
        .eq("user_id", user_id)
        .execute()
    )
    
    return {"success": True, "data": row.data[0] if row.data else None}
