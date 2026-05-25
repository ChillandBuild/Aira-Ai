# Register in main.py: app.include_router(numbers_health_router, prefix='/api/v1/numbers')
import logging
from fastapi import APIRouter, Depends
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/quality-history")
async def get_quality_history(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("phone_number_quality_history")
        .select("*")
        .eq("tenant_id", tenant_id)
        .order("recorded_at", desc=True)
        .limit(200)
        .execute()
    )
    return {"data": result.data or []}
