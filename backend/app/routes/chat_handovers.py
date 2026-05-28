import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id, get_tenant_and_role

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/")
def list_handovers(ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    query = (
        db.table("chat_handovers")
        .select("id, lead_id, assigned_to, reason, status, opened_at, leads(name, phone, segment, source, tg_username, ig_user_id, fb_user_id)")
        .eq("tenant_id", ctx["tenant_id"])
        .eq("status", "pending")
        .order("opened_at", desc=True)
        .limit(50)
    )
    if ctx["role"] == "caller" and ctx.get("caller_id"):
        query = query.eq("assigned_to", ctx["caller_id"])
    try:
        rows = query.execute()
    except Exception as e:
        logger.warning(f"chat_handovers list failed (transient?): {e}")
        return {"data": []}

    handovers = rows.data or []

    # Attach caller names in one batch lookup
    caller_ids = list({h["assigned_to"] for h in handovers if h.get("assigned_to")})
    caller_map: dict = {}
    if caller_ids:
        try:
            callers = db.table("callers").select("id, name").in_("id", caller_ids).execute()
            caller_map = {c["id"]: c["name"] for c in (callers.data or [])}
        except Exception:
            pass
    for h in handovers:
        h["caller_name"] = caller_map.get(h.get("assigned_to")) if h.get("assigned_to") else None

    return {"data": handovers}


@router.get("/count")
def handover_count(ctx: dict = Depends(get_tenant_and_role)):
    """Sidebar badge polls this every 60s. Swallow transient Supabase
    HTTP/2 disconnects (RemoteProtocolError) so a flaky connection doesn't
    spam 500s into the UI — the next poll will succeed."""
    db = get_supabase()
    query = (
        db.table("chat_handovers")
        .select("id", count="exact")
        .eq("tenant_id", ctx["tenant_id"])
        .eq("status", "pending")
    )
    if ctx["role"] == "caller" and ctx.get("caller_id"):
        query = query.eq("assigned_to", ctx["caller_id"])
    try:
        result = query.execute()
    except Exception as e:
        logger.warning(f"chat_handovers count failed (transient?): {e}")
        return {"count": 0}
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
                "ai_enabled": True,
            }).eq("id", lead_id).eq("tenant_id", tenant_id).execute()

    return {"resolved": True}
