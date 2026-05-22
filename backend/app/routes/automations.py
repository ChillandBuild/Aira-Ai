import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Schemas ──────────────────────────────────────────────────────────────────

class StepIn(BaseModel):
    id: str | None = None
    step_type: str
    config: dict = {}
    parent_step_id: str | None = None
    branch: str | None = None
    position: int = 0


class AutomationCreate(BaseModel):
    name: str
    trigger_type: str
    trigger_config: dict = {}
    active: bool = False
    steps: list[StepIn] = []


class AutomationUpdate(BaseModel):
    name: str | None = None
    trigger_type: str | None = None
    trigger_config: dict | None = None
    active: bool | None = None
    steps: list[StepIn] | None = None


# ─── Validation ───────────────────────────────────────────────────────────────

_VALID_TRIGGERS = {
    "lead_created", "first_inbound_message", "new_message_received",
    "keyword_match", "segment_changed", "score_threshold",
}
_VALID_STEPS = {
    "send_message", "send_template", "assign_lead",
    "update_segment", "add_note", "send_webhook",
    "wait", "condition", "create_followup",
}


def _validate(trigger_type: str, trigger_config: dict, steps: list) -> list[str]:
    errors: list[str] = []
    if trigger_type not in _VALID_TRIGGERS:
        errors.append(f"Invalid trigger_type: {trigger_type}")
    if trigger_type == "keyword_match" and not trigger_config.get("keywords"):
        errors.append("keyword_match requires at least one keyword")
    if trigger_type == "segment_changed":
        seg = trigger_config.get("to_segment")
        if seg and seg not in ("A", "B", "C", "D"):
            errors.append("to_segment must be A/B/C/D")
    for i, step in enumerate(steps):
        if step.get("step_type") not in _VALID_STEPS:
            errors.append(f"Step {i}: invalid step_type {step.get('step_type')}")
        if step.get("step_type") == "send_message" and not step.get("config", {}).get("message"):
            errors.append(f"Step {i}: send_message requires a message")
        if step.get("step_type") == "update_segment":
            seg = step.get("config", {}).get("segment")
            if seg not in ("A", "B", "C", "D"):
                errors.append(f"Step {i}: update_segment requires segment A/B/C/D")
        if step.get("step_type") == "wait":
            amount = step.get("config", {}).get("amount", 0)
            if not amount or int(amount) < 1:
                errors.append(f"Step {i}: wait requires amount >= 1")
        if step.get("step_type") == "send_webhook":
            url = step.get("config", {}).get("url", "")
            if not url.startswith(("http://", "https://")):
                errors.append(f"Step {i}: send_webhook requires a valid http/https URL")
    return errors


def _upsert_steps(automation_id: str, tenant_id: str, steps: list[StepIn], db) -> None:
    db.table("automation_steps").delete().eq("automation_id", automation_id).execute()
    if not steps:
        return
    rows = [
        {
            "automation_id": automation_id,
            "tenant_id": tenant_id,
            "step_type": s.step_type,
            "config": s.config,
            "parent_step_id": s.parent_step_id,
            "branch": s.branch,
            "position": s.position,
        }
        for s in steps
    ]
    db.table("automation_steps").insert(rows).execute()


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("/")
async def list_automations(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    res = (
        db.table("automations")
        .select("id,name,trigger_type,active,run_count,created_at,updated_at")
        .eq("tenant_id", tenant_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"data": res.data or []}


@router.post("/", status_code=201)
async def create_automation(payload: AutomationCreate, tenant_id: str = Depends(get_tenant_id)):
    steps_raw = [s.model_dump() for s in payload.steps]
    if payload.active:
        errors = _validate(payload.trigger_type, payload.trigger_config, steps_raw)
        if errors:
            raise HTTPException(status_code=422, detail=errors)
    db = get_supabase()
    res = db.table("automations").insert({
        "tenant_id": tenant_id,
        "name": payload.name,
        "trigger_type": payload.trigger_type,
        "trigger_config": payload.trigger_config,
        "active": payload.active,
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create automation")
    automation_id = res.data[0]["id"]
    _upsert_steps(automation_id, tenant_id, payload.steps, db)
    return {"data": res.data[0]}


@router.get("/{automation_id}")
async def get_automation(automation_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    auto = (
        db.table("automations")
        .select("*")
        .eq("id", str(automation_id))
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not auto.data:
        raise HTTPException(status_code=404, detail="Automation not found")
    steps = (
        db.table("automation_steps")
        .select("*")
        .eq("automation_id", str(automation_id))
        .order("position")
        .execute()
    )
    return {"data": {**auto.data, "steps": steps.data or []}}


@router.patch("/{automation_id}")
async def update_automation(
    automation_id: UUID,
    payload: AutomationUpdate,
    tenant_id: str = Depends(get_tenant_id),
):
    db = get_supabase()
    existing = (
        db.table("automations")
        .select("*")
        .eq("id", str(automation_id))
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Automation not found")

    updates: dict = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.trigger_type is not None:
        updates["trigger_type"] = payload.trigger_type
    if payload.trigger_config is not None:
        updates["trigger_config"] = payload.trigger_config
    if payload.active is not None:
        updates["active"] = payload.active

    merged_trigger = updates.get("trigger_type", existing.data["trigger_type"])
    merged_config = updates.get("trigger_config", existing.data["trigger_config"])
    will_be_active = updates.get("active", existing.data["active"])

    if will_be_active and payload.steps is not None:
        steps_raw = [s.model_dump() for s in payload.steps]
        errors = _validate(merged_trigger, merged_config, steps_raw)
        if errors:
            raise HTTPException(status_code=422, detail=errors)
    elif will_be_active and payload.steps is None:
        cur_steps = (
            db.table("automation_steps")
            .select("*")
            .eq("automation_id", str(automation_id))
            .execute()
        )
        errors = _validate(merged_trigger, merged_config, cur_steps.data or [])
        if errors:
            raise HTTPException(status_code=422, detail=errors)

    if updates:
        updates["updated_at"] = "now()"
        db.table("automations").update(updates).eq("id", str(automation_id)).execute()

    if payload.steps is not None:
        _upsert_steps(str(automation_id), tenant_id, payload.steps, db)

    return await get_automation(automation_id, tenant_id)


@router.delete("/{automation_id}", status_code=204)
async def delete_automation(automation_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    existing = (
        db.table("automations")
        .select("id")
        .eq("id", str(automation_id))
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Automation not found")
    db.table("automations").delete().eq("id", str(automation_id)).execute()


@router.post("/{automation_id}/duplicate", status_code=201)
async def duplicate_automation(automation_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    src = (
        db.table("automations")
        .select("*")
        .eq("id", str(automation_id))
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not src.data:
        raise HTTPException(status_code=404, detail="Automation not found")
    new_auto = db.table("automations").insert({
        "tenant_id": tenant_id,
        "name": src.data["name"] + " (Copy)",
        "trigger_type": src.data["trigger_type"],
        "trigger_config": src.data["trigger_config"],
        "active": False,
    }).execute()
    new_id = new_auto.data[0]["id"]
    steps = (
        db.table("automation_steps")
        .select("*")
        .eq("automation_id", str(automation_id))
        .execute()
    )
    if steps.data:
        new_steps = [
            {
                "automation_id": new_id,
                "tenant_id": tenant_id,
                "step_type": s["step_type"],
                "config": s["config"],
                "parent_step_id": s.get("parent_step_id"),
                "branch": s.get("branch"),
                "position": s["position"],
            }
            for s in steps.data
        ]
        db.table("automation_steps").insert(new_steps).execute()
    return {"data": new_auto.data[0]}


@router.get("/{automation_id}/logs")
async def get_automation_logs(automation_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    existing = (
        db.table("automations")
        .select("id")
        .eq("id", str(automation_id))
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Automation not found")
    logs = (
        db.table("automation_logs")
        .select("id,trigger_type,status,steps_results,created_at,lead_id")
        .eq("automation_id", str(automation_id))
        .order("created_at", desc=True)
        .limit(100)
        .execute()
    )
    return {"data": logs.data or []}


@router.post("/process-pending")
async def process_pending(tenant_id: str = Depends(get_tenant_id)):
    """Cron endpoint to resume wait-step executions that are due."""
    from app.services.automation_engine import resume_pending_executions
    count = await resume_pending_executions()
    return {"processed": count}
