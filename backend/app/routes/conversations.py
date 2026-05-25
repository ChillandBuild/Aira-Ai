import logging
from fastapi import APIRouter, Depends, Query
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_and_role

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def list_conversations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    ctx: dict = Depends(get_tenant_and_role),
):
    db = get_supabase()
    tenant_id = ctx["tenant_id"]

    rpc_rows = db.rpc(
        "get_conversation_leads",
        {"p_tenant_id": tenant_id, "p_limit": limit, "p_offset": offset},
    ).execute()

    rows = rpc_rows.data or []
    if not rows:
        return {"leads": [], "total": 0}

    total = int(rows[0].get("total", 0)) if rows else 0
    lead_ids = [r["lead_id"] for r in rows if r.get("lead_id")]
    last_reply_map = {r["lead_id"]: r["last_reply_at"] for r in rows if r.get("lead_id")}

    if not lead_ids:
        return {"leads": [], "total": 0}

    lead_query = (
        db.table("leads")
        .select("*")
        .in_("id", lead_ids)
        .eq("tenant_id", tenant_id)
        .neq("opted_out", True)
        .is_("deleted_at", "null")
    )

    # Callers only see conversations for their assigned leads
    if ctx.get("role") == "caller" and ctx.get("caller_id"):
        lead_query = lead_query.eq("assigned_to", ctx["caller_id"])

    lead_rows = lead_query.execute()

    lead_map = {l["id"]: l for l in (lead_rows.data or [])}
    leads = []
    for lid in lead_ids:
        if lid in lead_map:
            lead = dict(lead_map[lid])
            lead["last_reply_at"] = last_reply_map.get(lid)
            leads.append(lead)

    return {"leads": leads, "total": total}
