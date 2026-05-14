import logging
from fastapi import APIRouter, Depends, Query
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("")
async def list_conversations(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant_id: str = Depends(get_tenant_id),
):
    db = get_supabase()

    msg_rows = (
        db.table("messages")
        .select("lead_id, created_at")
        .eq("direction", "inbound")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .execute()
    )

    seen: dict[str, str] = {}
    for row in msg_rows.data or []:
        lid = row.get("lead_id")
        if lid and lid not in seen:
            seen[lid] = row["created_at"]

    ordered_ids = list(seen.keys())
    total = len(ordered_ids)
    page_ids = ordered_ids[offset: offset + limit]

    if not page_ids:
        return {"leads": [], "total": total}

    lead_rows = (
        db.table("leads")
        .select("*")
        .in_("id", page_ids)
        .eq("tenant_id", tenant_id)
        .neq("opted_out", True)
        .is_("deleted_at", "null")
        .execute()
    )

    lead_map = {l["id"]: l for l in (lead_rows.data or [])}
    leads = []
    for lid in page_ids:
        if lid in lead_map:
            lead = dict(lead_map[lid])
            lead["last_reply_at"] = seen[lid]
            leads.append(lead)

    return {"leads": leads, "total": total}
