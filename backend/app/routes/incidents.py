import logging
from fastapi import APIRouter
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
async def list_incidents(limit: int = 50, offset: int = 0):
    db = get_supabase()
    result = (
        db.table("incidents")
        .select("*")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"data": result.data or []}
