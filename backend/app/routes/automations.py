import logging
from typing import Literal
from uuid import UUID, uuid4
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id, require_owner

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(require_owner)])


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
    flow_kind: Literal["automation", "bot_flow"] = "automation"
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
    "send_image", "send_video", "send_file", "send_location", "cta_url",
    "user_input", "http_api", "random", "interactive", "ai_agent",
    "booking_create",
    # BotBiz blocks
    "send_audio", "send_list", "add_label", "send_catalog",
}


def _validate(trigger_type: str, trigger_config: dict, steps: list) -> list[str]:
    errors: list[str] = []
    if trigger_type not in _VALID_TRIGGERS:
        errors.append(f"Invalid trigger_type: {trigger_type}")
    if trigger_type == "keyword_match":
        if not trigger_config.get("keywords"):
            errors.append("keyword_match requires at least one keyword")
        match_mode = trigger_config.get("match_mode", "contains")
        if match_mode not in ("contains", "exact"):
            errors.append("keyword_match match_mode must be 'contains' or 'exact'")
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
        if step.get("step_type") in ("send_image", "send_video", "send_file"):
            url = step.get("config", {}).get("url", "")
            if not url.startswith("https://"):
                errors.append(f"Step {i}: {step.get('step_type')} requires a valid https URL")
        if step.get("step_type") == "send_location":
            cfg = step.get("config", {})
            try:
                float(cfg.get("latitude"))
                float(cfg.get("longitude"))
            except (TypeError, ValueError):
                errors.append(f"Step {i}: send_location requires numeric latitude and longitude")
        if step.get("step_type") == "user_input":
            cfg = step.get("config", {})
            if not cfg.get("prompt"):
                errors.append(f"Step {i}: user_input requires a prompt")
            if not cfg.get("save_as"):
                errors.append(f"Step {i}: user_input requires save_as")
        if step.get("step_type") == "cta_url":
            cfg = step.get("config", {})
            if not cfg.get("body"):
                errors.append(f"Step {i}: cta_url requires body")
            if not cfg.get("button_text"):
                errors.append(f"Step {i}: cta_url requires button_text")
            if not str(cfg.get("button_url", "")).startswith("https://"):
                errors.append(f"Step {i}: cta_url requires a valid https button_url")
        if step.get("step_type") == "http_api":
            cfg = step.get("config", {})
            if not cfg.get("save_as"):
                errors.append(f"Step {i}: http_api requires save_as")
            if not str(cfg.get("url", "")).startswith("https://"):
                errors.append(f"Step {i}: http_api requires a valid https url")
        if step.get("step_type") == "random":
            cfg = step.get("config", {})
            if not cfg.get("save_as"):
                errors.append(f"Step {i}: random requires save_as")
            for key in ("min", "max"):
                if key in cfg and cfg.get(key) is not None:
                    try:
                        float(cfg.get(key))
                    except (TypeError, ValueError):
                        errors.append(f"Step {i}: random {key} must be numeric")
        if step.get("step_type") == "ai_agent":
            cfg = step.get("config", {})
            if not cfg.get("goal"):
                errors.append(f"Step {i}: ai_agent requires a goal")
        if step.get("step_type") == "booking_create":
            cfg = step.get("config", {})
            vm = cfg.get("variables_map")
            if vm is not None and not isinstance(vm, dict):
                errors.append(f"Step {i}: booking_create variables_map must be an object")
            elif isinstance(vm, dict):
                for field, var in vm.items():
                    if not isinstance(var, str) or not var.strip():
                        errors.append(f"Step {i}: booking_create variables_map.{field} must be a non-empty string")
            outs = cfg.get("outcomes") or []
            if not (1 <= len(outs) <= 5) or any(not str(o).strip() for o in outs):
                errors.append(f"Step {i}: ai_agent requires 1..5 non-empty outcomes")
            elif len(outs) != len(set(outs)):
                errors.append(f"Step {i}: ai_agent outcomes must be unique")
            if not cfg.get("output_var"):
                errors.append(f"Step {i}: ai_agent requires output_var")
            mt = cfg.get("max_turns", 6)
            try:
                if not (1 <= int(mt) <= 20):
                    errors.append(f"Step {i}: ai_agent max_turns must be 1..20")
            except (TypeError, ValueError):
                errors.append(f"Step {i}: ai_agent max_turns must be numeric")
            from app.services.agent_runtime import VALID_TOOLS
            for t in (cfg.get("tools") or []):
                if t not in VALID_TOOLS:
                    errors.append(f"Step {i}: ai_agent unknown tool {t}")
        if step.get("step_type") == "interactive":
            cfg = step.get("config", {})
            if not cfg.get("body"):
                errors.append(f"Step {i}: interactive requires body")
            buttons = cfg.get("buttons") or []
            if not (1 <= len(buttons) <= 3):
                errors.append(f"Step {i}: interactive requires 1..3 buttons")
            else:
                for b in buttons:
                    if not b.get("id") or not b.get("title"):
                        errors.append(f"Step {i}: each interactive button requires id and title")
                        break
        if step.get("step_type") == "send_audio":
            url = step.get("config", {}).get("url", "")
            if not url.startswith("https://"):
                errors.append(f"Step {i}: send_audio requires a valid https URL")
        if step.get("step_type") == "send_list":
            cfg = step.get("config", {})
            if not cfg.get("body"):
                errors.append(f"Step {i}: send_list requires body")
            if not cfg.get("button_text"):
                errors.append(f"Step {i}: send_list requires button_text")
            if not cfg.get("save_as"):
                errors.append(f"Step {i}: send_list requires save_as")
            sections = cfg.get("sections") or []
            if not sections:
                errors.append(f"Step {i}: send_list requires at least one section")
            else:
                total_rows = sum(len(s.get("rows") or []) for s in sections)
                if not (1 <= total_rows <= 10):
                    errors.append(f"Step {i}: send_list total rows must be 1..10")
        if step.get("step_type") == "add_label":
            cfg = step.get("config", {})
            if not cfg.get("tag_id"):
                errors.append(f"Step {i}: add_label requires tag_id")
            if cfg.get("action", "add") not in ("add", "remove"):
                errors.append(f"Step {i}: add_label action must be 'add' or 'remove'")
        if step.get("step_type") == "send_catalog":
            cfg = step.get("config", {})
            if not cfg.get("catalog_id"):
                errors.append(f"Step {i}: send_catalog requires catalog_id")
            if not cfg.get("body"):
                errors.append(f"Step {i}: send_catalog requires body")
            if not (cfg.get("sections") or cfg.get("product_ids")):
                errors.append(f"Step {i}: send_catalog requires product_ids")
    return errors


def _upsert_steps(automation_id: str, tenant_id: str, steps: list[StepIn], db) -> None:
    db.table("automation_steps").delete().eq("automation_id", automation_id).execute()
    if not steps:
        return
    # Persist the client-supplied id so parent_step_id references (condition
    # branches) resolve after the delete+reinsert. Frontend emits a UUID per node.
    rows = [
        {
            **({"id": s.id} if s.id else {}),
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
async def list_automations(
    flow_kind: Literal["automation", "bot_flow"] | None = None,
    tenant_id: str = Depends(get_tenant_id),
):
    db = get_supabase()
    query = (
        db.table("automations")
        .select("id,name,trigger_type,active,run_count,subscriber_count,flow_kind,created_at,updated_at")
        .eq("tenant_id", tenant_id)
    )
    if flow_kind:
        query = query.eq("flow_kind", flow_kind)
    res = query.order("created_at", desc=True).execute()
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
        "flow_kind": payload.flow_kind,
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
        "flow_kind": src.data.get("flow_kind", "automation"),
    }).execute()
    new_id = new_auto.data[0]["id"]
    steps = (
        db.table("automation_steps")
        .select("*")
        .eq("automation_id", str(automation_id))
        .execute()
    )
    if steps.data:
        # Remap old step ids → new ids so parent_step_id (condition branches)
        # references stay intact within the duplicated flow.
        id_map = {s["id"]: str(uuid4()) for s in steps.data}
        new_steps = [
            {
                "id": id_map[s["id"]],
                "automation_id": new_id,
                "tenant_id": tenant_id,
                "step_type": s["step_type"],
                "config": s["config"],
                "parent_step_id": id_map.get(s.get("parent_step_id")),
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
    """Cron endpoint to resume wait-step flow runs that are due."""
    from app.services.automation_engine import resume_due_flow_runs
    count = await resume_due_flow_runs()
    return {"processed": count}
