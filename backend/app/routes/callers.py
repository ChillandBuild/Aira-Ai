import logging
from datetime import datetime, timezone, timedelta
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id, get_tenant_and_role
from app.services.assignment import is_round_robin_enabled, set_round_robin_enabled
from app.services.call_coach import coaching_tip

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateCaller(BaseModel):
    name: str
    phone: str


class UpdateCaller(BaseModel):
    name: str | None = None
    phone: str | None = None


class RoundRobinToggle(BaseModel):
    enabled: bool


class StatusToggle(BaseModel):
    status: str  # "active" | "idle"


# ── Round-robin toggle ───────────────────────────────────────────────────────


@router.get("/round-robin")
async def get_round_robin(tenant_id: str = Depends(get_tenant_id)):
    """Return whether auto round-robin assignment is currently enabled."""
    return {"enabled": is_round_robin_enabled(tenant_id)}


@router.patch("/round-robin")
async def toggle_round_robin(payload: RoundRobinToggle, tenant_id: str = Depends(get_tenant_id)):
    """Enable or disable automatic round-robin lead assignment for new inbound leads."""
    set_round_robin_enabled(tenant_id, payload.enabled)
    return {"enabled": payload.enabled}


# ── Caller status (idle/active) ──────────────────────────────────────────────


@router.patch("/my-status")
async def update_my_status(payload: StatusToggle, ctx: dict = Depends(get_tenant_and_role)):
    """Caller toggles their own idle/active status."""
    if payload.status not in ("active", "idle"):
        raise HTTPException(status_code=400, detail="Status must be 'active' or 'idle'")

    caller_id = ctx.get("caller_id")
    if not caller_id:
        raise HTTPException(status_code=403, detail="Only callers can toggle status")

    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()

    # Close the previous status log entry
    db.table("caller_status_logs").update(
        {"ended_at": now}
    ).eq("caller_id", caller_id).is_("ended_at", "null").execute()

    # Insert new status log entry
    db.table("caller_status_logs").insert({
        "caller_id": caller_id,
        "tenant_id": ctx["tenant_id"],
        "status": payload.status,
        "started_at": now,
    }).execute()

    # Update caller record
    db.table("callers").update({
        "status": payload.status,
        "status_changed_at": now,
    }).eq("id", caller_id).execute()

    return {"status": payload.status, "changed_at": now}


@router.get("/my-status")
async def get_my_status(ctx: dict = Depends(get_tenant_and_role)):
    """Get the current caller's status."""
    caller_id = ctx.get("caller_id")
    if not caller_id:
        # For owners, return active always
        return {"status": "active", "caller_id": None}

    db = get_supabase()
    result = (
        db.table("callers")
        .select("id,status,status_changed_at")
        .eq("id", caller_id)
        .single()
        .execute()
    )
    return result.data


# ── Caller stats (for profile page) ──────────────────────────────────────────


@router.get("/my-stats")
async def get_my_stats(ctx: dict = Depends(get_tenant_and_role)):
    """Return the current caller's performance stats."""
    caller_id = ctx.get("caller_id")
    if not caller_id:
        raise HTTPException(status_code=403, detail="Only callers can view their stats")

    db = get_supabase()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=7)).isoformat()

    # Calls today
    calls_today_res = (
        db.table("call_logs")
        .select("id", count="exact")
        .eq("caller_id", caller_id)
        .gte("created_at", today_start)
        .execute()
    )

    # Calls this week
    calls_week_res = (
        db.table("call_logs")
        .select("id,outcome,duration_seconds", count="exact")
        .eq("caller_id", caller_id)
        .gte("created_at", week_start)
        .execute()
    )
    week_logs = calls_week_res.data or []
    total_week = calls_week_res.count or 0
    converted_week = sum(1 for l in week_logs if l.get("outcome") == "converted")
    durations = [l["duration_seconds"] for l in week_logs if l.get("duration_seconds")]
    avg_duration = round(sum(durations) / len(durations)) if durations else None

    # Pending hot leads assigned to this caller
    pending_hot_res = (
        db.table("leads")
        .select("id", count="exact")
        .eq("assigned_to", caller_id)
        .eq("tenant_id", ctx["tenant_id"])
        .gte("score", 7)
        .is_("converted_at", "null")
        .execute()
    )

    # Overall score
    caller_res = (
        db.table("callers")
        .select("overall_score,name,phone,status")
        .eq("id", caller_id)
        .single()
        .execute()
    )

    return {
        "calls_today": calls_today_res.count or 0,
        "calls_this_week": total_week,
        "conversion_rate_week": round(converted_week / total_week, 2) if total_week > 0 else 0,
        "avg_duration_seconds": avg_duration,
        "pending_hot_leads": pending_hot_res.count or 0,
        "overall_score": float(caller_res.data.get("overall_score", 0)),
        "name": caller_res.data.get("name"),
        "phone": caller_res.data.get("phone"),
        "status": caller_res.data.get("status", "active"),
        "caller_id": caller_id,
    }


# ── Status summary (admin view) ──────────────────────────────────────────────


@router.get("/{caller_id}/status-summary")
async def get_status_summary(caller_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    """Admin views a caller's active/idle time breakdown for today."""
    db = get_supabase()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    logs = (
        db.table("caller_status_logs")
        .select("status,started_at,ended_at")
        .eq("caller_id", str(caller_id))
        .gte("started_at", today_start)
        .order("started_at")
        .execute()
    )

    active_minutes = 0
    idle_minutes = 0
    for log in (logs.data or []):
        start = datetime.fromisoformat(log["started_at"].replace("Z", "+00:00"))
        end = datetime.fromisoformat(log["ended_at"].replace("Z", "+00:00")) if log["ended_at"] else now
        delta = (end - start).total_seconds() / 60
        if log["status"] == "active":
            active_minutes += delta
        else:
            idle_minutes += delta

    # Current status
    caller = (
        db.table("callers")
        .select("status,status_changed_at")
        .eq("id", str(caller_id))
        .single()
        .execute()
    )

    return {
        "active_minutes_today": round(active_minutes),
        "idle_minutes_today": round(idle_minutes),
        "current_status": caller.data.get("status", "active"),
        "since": caller.data.get("status_changed_at"),
    }


# ── CRUD (existing) ──────────────────────────────────────────────────────────


@router.post("/")
async def create_caller(payload: CreateCaller, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("callers").insert({
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "active": True,
        "overall_score": 7.0,
        "tenant_id": tenant_id,
    }).execute()
    return result.data[0]


@router.get("/")
async def list_callers(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    callers = db.table("callers").select("*").eq("tenant_id", tenant_id).eq("active", True).order("overall_score", desc=True).execute()
    return {"data": callers.data or []}


@router.patch("/{caller_id}")
async def update_caller(caller_id: UUID, payload: UpdateCaller, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name.strip()
    if payload.phone is not None:
        updates["phone"] = payload.phone.strip()
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    result = db.table("callers").update(updates).eq("id", str(caller_id)).eq("tenant_id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Caller not found")
    return result.data[0]


@router.delete("/{caller_id}")
async def delete_caller(caller_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    db.table("callers").update({"active": False}).eq("id", str(caller_id)).eq("tenant_id", tenant_id).execute()
    return {"deleted": True}


@router.get("/{caller_id}/logs")
async def list_caller_logs(caller_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = (
        db.table("call_logs")
        .select("id,lead_id,call_sid,duration_seconds,outcome,recording_url,score,status,ai_summary,transcript,created_at,leads(phone,name)")
        .eq("caller_id", str(caller_id))
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    return {"data": result.data or []}


@router.get("/{caller_id}/coaching")
async def get_coaching(caller_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    caller = db.table("callers").select("id").eq("id", str(caller_id)).eq("tenant_id", tenant_id).maybe_single().execute()
    if not caller.data:
        raise HTTPException(status_code=404, detail="Caller not found")
    tip = await coaching_tip(str(caller_id))
    return {"caller_id": str(caller_id), "tip": tip}
