from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

router = APIRouter()


@router.get("/")
def list_handovers(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    rows = (
        db.table("chat_handovers")
        .select("id, lead_id, assigned_to, reason, status, opened_at, leads(name, phone, segment)")
        .eq("tenant_id", tenant_id)
        .eq("status", "pending")
        .order("opened_at", desc=True)
        .limit(50)
        .execute()
    )
    return {"data": rows.data or []}


@router.get("/count")
def handover_count(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("chat_handovers")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("status", "pending")
        .execute()
    )
    return {"count": result.count or 0}


@router.patch("/{handover_id}/resolve")
def resolve_handover(handover_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("chat_handovers").update({
        "status": "resolved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", handover_id).eq("tenant_id", tenant_id).execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Handover not found")

    lead_id = result.data[0].get("lead_id")
    if lead_id:
        remaining = (
            db.table("chat_handovers")
            .select("id", count="exact")
            .eq("lead_id", lead_id)
            .eq("status", "pending")
            .execute()
        )
        if not (remaining.count or 0):
            db.table("leads").update({
                "needs_human_attention": False,
                "escalation_reason": None,
            }).eq("id", lead_id).execute()

    return {"resolved": True}
