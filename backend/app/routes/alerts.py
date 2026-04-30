import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_and_role

logger = logging.getLogger(__name__)
router = APIRouter()

_ESCALATION_MINUTES = 5


@router.get("/mine")
async def get_my_alerts(ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    tenant_id = ctx["tenant_id"]
    role = ctx["role"]
    caller_id = ctx.get("caller_id")

    now = datetime.now(timezone.utc)
    escalation_cutoff = (now - timedelta(minutes=_ESCALATION_MINUTES)).isoformat()

    # Auto-escalate old pending alerts
    try:
        db.table("hot_lead_alerts").update({"status": "escalated"}).eq(
            "tenant_id", tenant_id
        ).eq("status", "pending").lt("created_at", escalation_cutoff).execute()
    except Exception as e:
        logger.warning(f"Escalation update failed: {e}")

    if role == "caller" and caller_id:
        pending_own = (
            db.table("hot_lead_alerts")
            .select("*, lead:leads(id,name,phone,score,segment)")
            .eq("tenant_id", tenant_id)
            .eq("assigned_caller_id", caller_id)
            .eq("status", "pending")
            .order("created_at", desc=True)
            .execute()
        )
        escalated = (
            db.table("hot_lead_alerts")
            .select("*, lead:leads(id,name,phone,score,segment)")
            .eq("tenant_id", tenant_id)
            .eq("status", "escalated")
            .order("created_at", desc=True)
            .execute()
        )
        alerts = (pending_own.data or []) + (escalated.data or [])
    else:
        all_alerts = (
            db.table("hot_lead_alerts")
            .select("*, lead:leads(id,name,phone,score,segment)")
            .eq("tenant_id", tenant_id)
            .in_("status", ["pending", "escalated"])
            .order("created_at", desc=True)
            .execute()
        )
        alerts = all_alerts.data or []

    return {"data": alerts}


@router.patch("/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, ctx: dict = Depends(get_tenant_and_role)):
    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    caller_id = ctx.get("caller_id")

    res = db.table("hot_lead_alerts").update({
        "status": "acknowledged",
        "acknowledged_at": now,
        "acknowledged_by": caller_id,
    }).eq("id", alert_id).eq("tenant_id", ctx["tenant_id"]).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"success": True}


def create_alert(lead_id: str, tenant_id: str, assigned_caller_id: str | None) -> None:
    """Internal — called from ai_reply.py. Fire and forget."""
    try:
        db = get_supabase()
        existing = (
            db.table("hot_lead_alerts")
            .select("id")
            .eq("lead_id", lead_id)
            .eq("tenant_id", tenant_id)
            .in_("status", ["pending", "escalated"])
            .maybe_single()
            .execute()
        )
        if existing and existing.data:
            return
        db.table("hot_lead_alerts").insert({
            "lead_id": lead_id,
            "tenant_id": tenant_id,
            "assigned_caller_id": assigned_caller_id,
        }).execute()
        logger.info(f"Hot lead alert created for lead {lead_id}")
    except Exception as e:
        logger.error(f"Failed to create alert for lead {lead_id}: {e}")
