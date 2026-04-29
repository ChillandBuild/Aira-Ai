import logging
from fastapi import APIRouter, Depends
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
async def list_incidents(limit: int = 50, offset: int = 0, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("incidents")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return {"data": result.data or []}
