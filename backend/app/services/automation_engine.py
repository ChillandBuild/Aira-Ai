"""
Automation Engine — executes step trees for matching automations.

Booking-flow safety: send_message / send_template steps are skipped when the
lead is mid-booking (collecting_* states). They are NOT skipped for wait/
condition/assign_lead/update_segment/add_note/send_webhook steps.

FAQ-first invariant: keyword_match trigger is evaluated by automation_triggers.py
AFTER the message has been stored but BEFORE generate_reply is queued, so it
never alters the FAQ-check ordering inside ai_reply.py.
"""

import logging
import httpx
from datetime import datetime, timezone, timedelta
from uuid import UUID

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

# States where we must not inject an unsolicited automation message
_BOOKING_ACTIVE_STATES = {
    "collecting_name", "collecting_rasi", "collecting_nakshatram",
    "collecting_gotram", "collecting_address", "awaiting_payment",
}


# ─── Tree helpers ────────────────────────────────────────────────────────────

def _build_tree(steps: list[dict]) -> list[dict]:
    """Return only root steps (parent_step_id IS NULL), sorted by position."""
    return sorted(
        [s for s in steps if not s.get("parent_step_id")],
        key=lambda s: s.get("position", 0),
    )


def _children(steps: list[dict], parent_id: str, branch: str | None = None) -> list[dict]:
    return sorted(
        [
            s for s in steps
            if s.get("parent_step_id") == parent_id
            and (branch is None or s.get("branch") == branch)
        ],
        key=lambda s: s.get("position", 0),
    )


def _next_step_id(
    steps_flat: list[dict], current_id: str, branch: str | None = None
) -> str | None:
    """Pure traversal: id of the node to execute after current_id, or None when done.

    Tree-as-sequence semantics that reproduce Phase-1 recursion's *return* behavior:
    a linear run is a set of siblings sharing (parent_step_id, branch); only a chosen
    condition/interactive branch descends into children.
    """
    by_id = {s["id"]: s for s in steps_flat}
    cur = by_id.get(current_id)
    if cur is None:
        return None

    # 1) Descend into the chosen branch's first child (lowest position).
    if branch is not None:
        kids = _children(steps_flat, current_id, branch)
        if kids:
            return kids[0]["id"]
        # No children for this branch → fall through to sibling/walk-up logic.

    # 2) Linear advance: next sibling under same (parent, branch), then walk up.
    node = cur
    while node is not None:
        parent_id = node.get("parent_step_id")
        node_branch = node.get("branch")
        node_pos = node.get("position", 0)

        if parent_id is None:
            roots = _build_tree(steps_flat)
            sibs = roots
        else:
            sibs = _children(steps_flat, parent_id, node_branch)

        nxt = next(
            (s for s in sibs if s.get("position", 0) > node_pos and s["id"] != node["id"]),
            None,
        )
        if nxt is not None:
            return nxt["id"]

        # No next sibling: pop to parent and look for parent's next sibling.
        node = by_id.get(parent_id) if parent_id is not None else None

    return None


# ─── Condition evaluator ─────────────────────────────────────────────────────

def _evaluate_condition(config: dict, lead_data: dict, message: str) -> bool:
    subject = config.get("subject", "")
    operator = config.get("operator", "equals")
    value = config.get("value", "")

    if subject == "segment":
        lead_val = lead_data.get("segment", "")
        return lead_val == value if operator == "equals" else lead_val != value

    if subject == "score":
        try:
            threshold = float(value)
            score = float(lead_data.get("score", 0))
            if operator == "gte":
                return score >= threshold
            if operator == "lte":
                return score <= threshold
            return score == threshold
        except (TypeError, ValueError):
            return False

    if subject == "channel":
        return (lead_data.get("source", "") == value) if operator == "equals" else \
               (lead_data.get("source", "") != value)

    if subject == "message_content":
        text = (message or "").lower()
        val = (value or "").lower()
        if operator == "contains":
            return val in text
        if operator == "not_contains":
            return val not in text
        return text == val

    return False


# ─── Send helpers ────────────────────────────────────────────────────────────

_NEW_SEND_STEPS = ("send_image", "send_video", "send_file", "send_location", "cta_url")


import re

_VAR_PATTERN = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def _interpolate(text: str, lead_data: dict, variables: dict | None = None) -> str:
    """Resolve {{key}} from the run's variable bag first, then the legacy
    name/phone defaulting (empty name → "there"). Phase-1 behavior preserved:
    {{name}}/{{phone}} still fall back to lead_data when not in the bag."""
    out = text or ""
    if variables:
        def _sub(m):
            key = m.group(1)
            # Empty/None treated as unset so {{name}}/{{phone}} fall through to the
            # legacy name/phone defaulting below (preserves "" name → "there").
            if key in variables and variables[key] not in (None, ""):
                return str(variables[key])
            return m.group(0)
        out = _VAR_PATTERN.sub(_sub, out)
    return out.replace(
        "{{name}}", lead_data.get("name") or "there"
    ).replace("{{phone}}", lead_data.get("phone") or "")


async def _send_text_via_channel(source: str, lead_data: dict, text: str, tenant_id: str) -> str | None:
    """Send a plain text message on the lead's channel. Returns msg id/wamid or None."""
    if source == "telegram":
        from app.services.ai_reply import send_telegram
        tg_id = lead_data.get("tg_user_id")
        return await send_telegram(tg_id, text, tenant_id=tenant_id) if tg_id else None
    if source == "instagram":
        from app.services.ai_reply import send_instagram
        ig_id = lead_data.get("ig_user_id")
        return await send_instagram(ig_id, text, tenant_id=tenant_id) if ig_id else None
    if source == "facebook":
        from app.services.ai_reply import send_facebook
        fb_id = lead_data.get("fb_user_id")
        return await send_facebook(fb_id, text, tenant_id=tenant_id) if fb_id else None
    from app.services.ai_reply import send_whatsapp
    phone = lead_data.get("phone")
    return await send_whatsapp(phone, text, tenant_id=tenant_id) if phone else None


def _bump_counter(db, step_id, field) -> None:
    try:
        db.rpc("bump_automation_step_counter", {"p_step_id": step_id, "p_field": field, "p_delta": 1}).execute()
    except Exception as e:
        logger.warning(f"counter bump ({field}) failed for step {step_id}: {e}")


def _record_outbound(db, step, lead_data, source, content, sid, automation_id) -> None:
    """Record a successful send: insert the messages row + bump sent_count.

    A None sid means the send did not happen (e.g. lead has no channel id); that is
    a skip, not an error — callers return 'skipped' and no counter is touched here.
    Error counting lives in the handlers' except blocks via _bump_counter.
    """
    if not sid:
        return
    step_id = step["id"]
    try:
        db.table("messages").insert({
            "lead_id": str(lead_data["id"]),
            "tenant_id": str(lead_data["tenant_id"]),
            "direction": "outbound",
            "channel": source,
            "content": content,
            "is_ai_generated": False,
            "reply_source": "automation",
            "meta_message_id": sid,
            "automation_id": automation_id,
            "automation_step_id": step_id,
        }).execute()
    except Exception as e:
        logger.error(f"automation outbound insert failed for step {step_id}: {e}")
    _bump_counter(db, step_id, "sent_count")


def _maps_link(lat, lon) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={lat},{lon}"


# ─── Step executor ───────────────────────────────────────────────────────────

async def _execute_step(
    step: dict,
    lead_data: dict,
    message: str,
    db,
    context: dict,
) -> dict:
    """Execute one step and return {"status": "ok"|"skipped"|"error", "detail": ...}."""
    step_type = step["step_type"]
    config = step.get("config") or {}
    lead_id = str(lead_data["id"])
    tenant_id = str(lead_data["tenant_id"])
    source = lead_data.get("source", "whatsapp")
    automation_id = context.get("automation_id")
    variables = context.get("variables") or {}

    # ── Booking-flow guard for outbound message steps ──────────────────────
    if step_type in ("send_message", "send_template", *_NEW_SEND_STEPS):
        try:
            from app.services.booking_flow import get_or_create_state
            conv_state = get_or_create_state(lead_id, tenant_id, db)
            if conv_state.get("state") in _BOOKING_ACTIVE_STATES:
                return {"status": "skipped", "detail": "lead mid-booking"}
        except Exception as e:
            logger.warning(f"Booking state check failed for lead {lead_id}: {e}")

    # ── send_message ──────────────────────────────────────────────────────
    if step_type == "send_message":
        text = config.get("message", "")
        if not text:
            return {"status": "error", "detail": "empty message"}
        text = _interpolate(text, lead_data, variables)
        try:
            sid = await _send_text_via_channel(source, lead_data, text, tenant_id)
            _record_outbound(db, step, lead_data, source, text, sid, automation_id)
            if not sid:
                return {"status": "skipped", "detail": "no channel id for lead"}
            return {"status": "ok", "detail": f"sent sid={sid}"}
        except Exception as e:
            logger.error(f"automation send_message failed for lead {lead_id}: {e}")
            _bump_counter(db, step["id"], "error_count")
            return {"status": "error", "detail": str(e)}

    # ── send_image / send_video ────────────────────────────────────────────
    if step_type in ("send_image", "send_video"):
        url_val = config.get("url", "")
        if not url_val:
            return {"status": "error", "detail": "empty url"}
        caption = _interpolate(config.get("caption", ""), lead_data, variables) or None
        wa_type = "image" if step_type == "send_image" else "video"
        try:
            sid = None
            if source == "whatsapp":
                from app.services.meta_cloud import send_media_message
                phone = lead_data.get("phone")
                if phone:
                    data = await send_media_message(
                        to_number=phone, wa_type=wa_type, media_link=url_val,
                        caption=caption, tenant_id=tenant_id,
                    )
                    sid = (data.get("messages") or [{}])[0].get("id")
            else:
                text = f"{caption}\n{url_val}" if caption else url_val
                sid = await _send_text_via_channel(source, lead_data, text, tenant_id)
            _record_outbound(db, step, lead_data, source, caption or url_val, sid, automation_id)
            if not sid:
                return {"status": "skipped", "detail": "no channel id for lead"}
            return {"status": "ok", "detail": f"sent {wa_type} sid={sid}"}
        except Exception as e:
            logger.error(f"automation {step_type} failed for lead {lead_id}: {e}")
            _bump_counter(db, step["id"], "error_count")
            return {"status": "error", "detail": str(e)}

    # ── send_file ──────────────────────────────────────────────────────────
    if step_type == "send_file":
        url_val = config.get("url", "")
        if not url_val:
            return {"status": "error", "detail": "empty url"}
        caption = _interpolate(config.get("caption", ""), lead_data, variables) or None
        filename = config.get("filename") or None
        try:
            sid = None
            if source == "whatsapp":
                from app.services.meta_cloud import send_media_message
                phone = lead_data.get("phone")
                if phone:
                    data = await send_media_message(
                        to_number=phone, wa_type="document", media_link=url_val,
                        filename=filename, caption=caption, tenant_id=tenant_id,
                    )
                    sid = (data.get("messages") or [{}])[0].get("id")
            else:
                text = f"{caption}\n{url_val}" if caption else url_val
                sid = await _send_text_via_channel(source, lead_data, text, tenant_id)
            _record_outbound(db, step, lead_data, source, caption or url_val, sid, automation_id)
            if not sid:
                return {"status": "skipped", "detail": "no channel id for lead"}
            return {"status": "ok", "detail": f"sent file sid={sid}"}
        except Exception as e:
            logger.error(f"automation send_file failed for lead {lead_id}: {e}")
            _bump_counter(db, step["id"], "error_count")
            return {"status": "error", "detail": str(e)}

    # ── send_location ──────────────────────────────────────────────────────
    if step_type == "send_location":
        try:
            lat = float(config.get("latitude"))
            lon = float(config.get("longitude"))
        except (TypeError, ValueError):
            return {"status": "error", "detail": "invalid latitude/longitude"}
        name = config.get("name") or None
        address = config.get("address") or None
        try:
            sid = None
            if source == "whatsapp":
                from app.services.meta_cloud import send_location_message
                phone = lead_data.get("phone")
                if phone:
                    data = await send_location_message(
                        to_number=phone, latitude=lat, longitude=lon,
                        name=name, address=address, tenant_id=tenant_id,
                    )
                    sid = (data.get("messages") or [{}])[0].get("id")
            else:
                label = name or "Location"
                text = f"{label}: {_maps_link(lat, lon)}"
                sid = await _send_text_via_channel(source, lead_data, text, tenant_id)
            _record_outbound(db, step, lead_data, source, name or _maps_link(lat, lon), sid, automation_id)
            if not sid:
                return {"status": "skipped", "detail": "no channel id for lead"}
            return {"status": "ok", "detail": f"sent location sid={sid}"}
        except Exception as e:
            logger.error(f"automation send_location failed for lead {lead_id}: {e}")
            _bump_counter(db, step["id"], "error_count")
            return {"status": "error", "detail": str(e)}

    # ── cta_url ────────────────────────────────────────────────────────────
    if step_type == "cta_url":
        body = _interpolate(config.get("body", ""), lead_data, variables)
        button_text = config.get("button_text", "")
        button_url = config.get("button_url", "")
        if not body or not button_text or not button_url:
            return {"status": "error", "detail": "cta_url requires body, button_text, button_url"}
        try:
            sid = None
            if source == "whatsapp":
                from app.services.meta_cloud import send_cta_url_message
                phone = lead_data.get("phone")
                if phone:
                    data = await send_cta_url_message(
                        to_number=phone, body_text=body, button_text=button_text,
                        button_url=button_url, tenant_id=tenant_id,
                    )
                    sid = (data.get("messages") or [{}])[0].get("id")
            else:
                text = f"{body}\n\n{button_text}: {button_url}"
                sid = await _send_text_via_channel(source, lead_data, text, tenant_id)
            _record_outbound(db, step, lead_data, source, body, sid, automation_id)
            if not sid:
                return {"status": "skipped", "detail": "no channel id for lead"}
            return {"status": "ok", "detail": f"sent cta_url sid={sid}"}
        except Exception as e:
            logger.error(f"automation cta_url failed for lead {lead_id}: {e}")
            _bump_counter(db, step["id"], "error_count")
            return {"status": "error", "detail": str(e)}

    # ── send_template ─────────────────────────────────────────────────────
    if step_type == "send_template":
        if source != "whatsapp":
            return {"status": "skipped", "detail": "templates only on whatsapp"}
        template_name = config.get("template_name", "")
        if not template_name:
            return {"status": "error", "detail": "no template_name"}
        try:
            from app.services.meta_cloud import MetaCloudProvider
            from app.config_dynamic import get_setting
            phone = lead_data.get("phone")
            if not phone:
                return {"status": "error", "detail": "no phone"}
            phone_number_id = get_setting("meta_phone_number_id", tenant_id=tenant_id)
            access_token = get_setting("meta_access_token", tenant_id=tenant_id)
            if not phone_number_id or not access_token:
                return {"status": "error", "detail": "meta credentials not set"}
            provider = MetaCloudProvider(
                phone_number_id=phone_number_id,
                access_token=access_token,
            )
            params = config.get("params", [])
            result = await provider.send_template(
                to_phone=phone,
                template_name=template_name,
                language_code=config.get("language_code", "en"),
                params=params,
            )
            return {"status": "ok", "detail": f"template sent: {result}"}
        except Exception as e:
            logger.error(f"automation send_template failed for lead {lead_id}: {e}")
            return {"status": "error", "detail": str(e)}

    # ── assign_lead ───────────────────────────────────────────────────────
    if step_type == "assign_lead":
        mode = config.get("mode", "round_robin")
        try:
            if mode == "specific":
                caller_id = config.get("caller_id")
                if caller_id:
                    db.table("leads").update({"assigned_to": caller_id}).eq("id", lead_id).execute()
                    return {"status": "ok", "detail": f"assigned to {caller_id}"}
                return {"status": "error", "detail": "no caller_id for specific mode"}
            else:
                from app.services.assignment import auto_assign_lead
                auto_assign_lead(lead_id, tenant_id)
                return {"status": "ok", "detail": "round-robin assigned"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    # ── update_segment ────────────────────────────────────────────────────
    if step_type == "update_segment":
        seg = config.get("segment", "")
        if seg not in ("A", "B", "C", "D"):
            return {"status": "error", "detail": f"invalid segment: {seg}"}
        try:
            db.table("leads").update({"segment": seg}).eq("id", lead_id).execute()
            from app.services.growth import record_stage_event
            record_stage_event(
                lead_id,
                from_segment=lead_data.get("segment"),
                to_segment=seg,
                event_type="segment_changed",
                metadata={"reason": "automation"},
                tenant_id=tenant_id,
                db=db,
            )
            return {"status": "ok", "detail": f"segment → {seg}"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    # ── add_note ──────────────────────────────────────────────────────────
    if step_type == "add_note":
        note = config.get("note", "")
        if not note:
            return {"status": "error", "detail": "empty note"}
        try:
            if variables:
                note = _VAR_PATTERN.sub(
                    lambda m: str(variables[m.group(1)]) if m.group(1) in variables and variables[m.group(1)] is not None else m.group(0),
                    note,
                )
            note = note.replace("{{name}}", lead_data.get("name") or "").replace("{{phone}}", lead_data.get("phone") or "")
            db.table("lead_notes").insert({
                "lead_id": lead_id,
                "tenant_id": tenant_id,
                "content": note,
                "source": "automation",
            }).execute()
            return {"status": "ok", "detail": "note added"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    # ── send_webhook ──────────────────────────────────────────────────────
    if step_type == "send_webhook":
        url = config.get("url", "")
        if not url or not url.startswith(("http://", "https://")):
            return {"status": "error", "detail": "invalid url"}
        try:
            payload = {
                "lead_id": lead_id,
                "tenant_id": tenant_id,
                "name": lead_data.get("name"),
                "phone": lead_data.get("phone"),
                "segment": lead_data.get("segment"),
                "score": lead_data.get("score"),
                "source": source,
                "message": message,
                "triggered_at": datetime.now(timezone.utc).isoformat(),
            }
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, timeout=10.0)
                return {"status": "ok", "detail": f"webhook {resp.status_code}"}
        except Exception as e:
            return {"status": "error", "detail": str(e)}

    # ── create_followup ───────────────────────────────────────────────────
    if step_type == "create_followup":
        due_in_minutes = int(config.get("due_in_minutes", 30))
        channel = config.get("channel", lead_data.get("source", "whatsapp"))
        try:
            scheduled_for = (datetime.now(timezone.utc) + timedelta(minutes=due_in_minutes)).isoformat()
            db.table("follow_up_jobs").insert({
                "lead_id": lead_id,
                "tenant_id": tenant_id,
                "channel": channel,
                "cadence": "callback",
                "status": "pending",
                "scheduled_for": scheduled_for,
                "message_preview": config.get("note", f"Auto-callback via automation"),
            }).execute()
            return {"status": "ok", "detail": f"callback scheduled in {due_in_minutes} min"}
        except Exception as e:
            logger.error(f"create_followup failed for lead {lead_id}: {e}")
            return {"status": "error", "detail": str(e)}

    # ── wait ──────────────────────────────────────────────────────────────
    if step_type == "wait":
        amount = int(config.get("amount", 1))
        unit = config.get("unit", "minutes")
        delta_map = {"minutes": timedelta(minutes=amount), "hours": timedelta(hours=amount), "days": timedelta(days=amount)}
        run_at = datetime.now(timezone.utc) + delta_map.get(unit, timedelta(minutes=amount))
        # resume_step_id will be set by caller to the NEXT sibling step
        return {"status": "wait", "run_at": run_at.isoformat(), "detail": f"wait {amount} {unit}"}

    # ── condition ─────────────────────────────────────────────────────────
    if step_type == "condition":
        result = _evaluate_condition(config, lead_data, message)
        return {"status": "ok", "branch": "yes" if result else "no", "detail": f"condition → {'yes' if result else 'no'}"}

    return {"status": "error", "detail": f"unknown step_type: {step_type}"}


# ─── Resumable driver (step-pointer state machine) ───────────────────────────

_MAX_ITER = 200  # infinite-loop guard


def _load_steps_flat(db, automation_id: str) -> list[dict]:
    res = (
        db.table("automation_steps")
        .select("*")
        .eq("automation_id", automation_id)
        .order("position")
        .execute()
    )
    return res.data or []


def _load_lead(db, lead_id: str, tenant_id: str) -> dict | None:
    row = (
        db.table("leads")
        .select("id,name,phone,source,segment,score,tenant_id,assigned_to,tg_user_id,ig_user_id,fb_user_id")
        .eq("id", lead_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    return row.data or None


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _finish_run(
    db,
    run: dict,
    status: str,
    steps_results: list[dict],
    trigger_type: str,
) -> None:
    """Mark the run done/failed, then write the legacy automation_logs row +
    bump run_count / subscriber_count (Phase-1 semantics, preserved)."""
    automation_id = str(run["automation_id"])
    lead_id = str(run["lead_id"])
    tenant_id = str(run["tenant_id"])
    if run.get("id") is not None:
        try:
            db.table("automation_flow_runs").update(
                {"status": status, "current_step_id": None, "updated_at": _now_iso()}
            ).eq("id", run["id"]).execute()
        except Exception as e:
            logger.error(f"flow_run {run['id']} final state update failed: {e}")

    overall_status = "success"
    if status == "failed":
        overall_status = "failure"
    elif any(r.get("status") == "error" for r in steps_results):
        overall_status = "partial" if any(r.get("status") == "ok" for r in steps_results) else "failure"

    try:
        is_new_subscriber = True
        try:
            prior = (
                db.table("automation_logs")
                .select("id")
                .eq("automation_id", automation_id)
                .eq("lead_id", lead_id)
                .limit(1)
                .execute()
            )
            is_new_subscriber = not (prior.data or [])
        except Exception as e:
            logger.warning(f"subscriber dedup check failed for {automation_id}: {e}")

        auto = (
            db.table("automations")
            .select("run_count,subscriber_count")
            .eq("id", automation_id)
            .maybe_single()
            .execute()
        )
        auto_data = auto.data or {}
        updates = {"run_count": (auto_data.get("run_count") or 0) + 1}
        if is_new_subscriber:
            updates["subscriber_count"] = (auto_data.get("subscriber_count") or 0) + 1
        db.table("automations").update(updates).eq("id", automation_id).execute()

        db.table("automation_logs").insert({
            "automation_id": automation_id,
            "lead_id": lead_id,
            "tenant_id": tenant_id,
            "trigger_type": trigger_type,
            "status": overall_status,
            "steps_results": steps_results,
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log automation {automation_id}: {e}")


async def _drive_run(run: dict, db, trigger_type: str = "") -> None:
    """Resumable executor: walk the step-pointer from run['current_step_id'],
    persisting state each iteration so a crash resumes mid-flow."""
    db = db or get_supabase()
    automation_id = str(run["automation_id"])
    tenant_id = str(run["tenant_id"])
    lead_id = str(run["lead_id"])

    lead_data = _load_lead(db, lead_id, tenant_id)
    if not lead_data:
        logger.warning(f"flow_run {run['id']}: lead {lead_id} not found")
        _finish_run(db, run, "failed", [{"status": "error", "detail": "lead not found"}], trigger_type)
        return

    steps_flat = _load_steps_flat(db, automation_id)
    by_id = {s["id"]: s for s in steps_flat}
    variables = run.get("variables") or {}
    message = run.get("trigger_message") or ""
    context = {"automation_id": automation_id, "variables": variables, "run_id": run["id"]}

    steps_results: list[dict] = []
    current_step_id = run.get("current_step_id")
    iterations = 0

    try:
        while current_step_id is not None:
            iterations += 1
            if iterations > _MAX_ITER:
                logger.error(f"flow_run {run['id']} exceeded {_MAX_ITER} iterations; failing")
                _finish_run(db, run, "failed", steps_results + [{"status": "error", "detail": "iteration cap exceeded"}], trigger_type)
                return

            step = by_id.get(current_step_id)
            if step is None:
                # Pointer references a missing node → treat flow as complete.
                break

            result = await _execute_step(step, lead_data, message, db, context)
            result["step_id"] = step["id"]
            result["step_type"] = step["step_type"]
            steps_results.append(result)

            # Persist any var mutations a block made (Milestone C blocks will).
            variables = context.get("variables") or variables

            status = result.get("status")
            step_type = step["step_type"]

            if status == "wait":
                next_id = _next_step_id(steps_flat, step["id"])
                db.table("automation_flow_runs").update({
                    "status": "waiting_time",
                    "resume_at": result.get("run_at"),
                    "current_step_id": next_id,
                    "variables": variables,
                    "updated_at": _now_iso(),
                }).eq("id", run["id"]).execute()
                return

            if status == "ok" and step_type == "condition":
                branch = result.get("branch")
                current_step_id = _next_step_id(steps_flat, step["id"], branch)
            else:
                current_step_id = _next_step_id(steps_flat, step["id"])

            # Crash-recovery: advance the pointer + variables each iteration.
            db.table("automation_flow_runs").update({
                "current_step_id": current_step_id,
                "variables": variables,
                "updated_at": _now_iso(),
            }).eq("id", run["id"]).execute()

        _finish_run(db, run, "done", steps_results, trigger_type)
    except Exception as e:
        logger.error(f"flow_run {run['id']} execution error: {e}")
        steps_results.append({"status": "error", "detail": str(e)})
        _finish_run(db, run, "failed", steps_results, trigger_type)


def _is_unique_violation(exc: Exception) -> bool:
    s = str(exc).lower()
    return "23505" in s or "duplicate key" in s or "unique constraint" in s


async def run_automation(
    automation: dict,
    lead_id: str,
    trigger_type: str,
    message: str,
    db=None,
) -> None:
    """Start a fresh run: seed variables, insert a flow-run row (one active run per
    lead+automation), then drive it via the step-pointer engine."""
    db = db or get_supabase()
    automation_id = str(automation["id"])
    tenant_id = str(automation["tenant_id"])

    lead_data = _load_lead(db, lead_id, tenant_id)
    if not lead_data:
        logger.warning(f"Automation {automation_id}: lead {lead_id} not found")
        return

    steps_flat = _load_steps_flat(db, automation_id)
    root_steps = _build_tree(steps_flat)
    if not root_steps:
        # No steps: nothing to execute, but preserve counter + log semantics.
        synthetic_run = {
            "id": None,
            "automation_id": automation_id,
            "lead_id": lead_id,
            "tenant_id": tenant_id,
        }
        # _finish_run needs a real run id for the flow-run update; skip that table
        # write for the no-steps case and only do counters + log.
        _finish_run_no_run_row(db, automation_id, lead_id, tenant_id, "done", [], trigger_type)
        return

    first_step_id = root_steps[0]["id"]

    seeded = {
        "name": str(lead_data.get("name") or ""),
        "phone": str(lead_data.get("phone") or ""),
        "segment": str(lead_data.get("segment") or ""),
        "score": str(lead_data.get("score") if lead_data.get("score") is not None else ""),
    }

    try:
        ins = db.table("automation_flow_runs").insert({
            "automation_id": automation_id,
            "lead_id": lead_id,
            "tenant_id": tenant_id,
            "status": "running",
            "current_step_id": first_step_id,
            "variables": seeded,
            "trigger_message": message,
        }).execute()
    except Exception as e:
        if _is_unique_violation(e):
            logger.info(f"Automation {automation_id}: active run already exists for lead {lead_id}; skipping")
            return
        logger.error(f"Automation {automation_id}: failed to create flow run for lead {lead_id}: {e}")
        return

    if not ins.data:
        logger.error(f"Automation {automation_id}: flow run insert returned no row for lead {lead_id}")
        return

    await _drive_run(ins.data[0], db, trigger_type)


def _finish_run_no_run_row(
    db, automation_id: str, lead_id: str, tenant_id: str, status: str, steps_results: list[dict], trigger_type: str
) -> None:
    """Counters + automation_logs for the no-steps path (no flow-run row to close)."""
    _finish_run(
        db,
        {"id": None, "automation_id": automation_id, "lead_id": lead_id, "tenant_id": tenant_id},
        status,
        steps_results,
        trigger_type,
    )


async def resume_due_flow_runs(db=None) -> int:
    """Resume time-waiting flow runs whose resume_at has passed. Returns count processed."""
    db = db or get_supabase()
    now = _now_iso()
    due = (
        db.table("automation_flow_runs")
        .select("*")
        .eq("status", "waiting_time")
        .lte("resume_at", now)
        .limit(50)
        .execute()
    )
    processed = 0
    for run in (due.data or []):
        try:
            auto_row = (
                db.table("automations")
                .select("*")
                .eq("id", run["automation_id"])
                .maybe_single()
                .execute()
            )
            if not auto_row.data or not auto_row.data.get("active"):
                # Automation deactivated mid-wait: close the run silently (no log /
                # no counter bump — matches Phase-1, which wrote nothing here).
                db.table("automation_flow_runs").update(
                    {"status": "done", "current_step_id": None, "updated_at": _now_iso()}
                ).eq("id", run["id"]).execute()
                continue

            # Optimistic guard: flip to running before advancing.
            db.table("automation_flow_runs").update(
                {"status": "running", "updated_at": _now_iso()}
            ).eq("id", run["id"]).execute()

            await _drive_run(run, db, auto_row.data["trigger_type"])
            processed += 1
        except Exception as e:
            logger.error(f"Failed to resume flow run {run['id']}: {e}")
            try:
                db.table("automation_flow_runs").update(
                    {"status": "failed", "updated_at": _now_iso()}
                ).eq("id", run["id"]).execute()
            except Exception:
                pass

    return processed


# Backwards-compat alias (retired path; kept so any stray import does not break).
async def resume_pending_executions(db=None) -> int:
    return await resume_due_flow_runs(db)


if __name__ == "__main__":
    # Pure traversal sanity checks for _next_step_id (no DB).
    def _s(sid, parent=None, branch=None, pos=0, t="send_message"):
        return {"id": sid, "parent_step_id": parent, "branch": branch, "position": pos, "step_type": t}

    _lin = [_s("A", pos=0), _s("B", pos=1), _s("C", pos=2)]
    assert _next_step_id(_lin, "A") == "B"
    assert _next_step_id(_lin, "C") is None

    _cond = [
        _s("C", pos=0, t="condition"), _s("D", pos=1),
        _s("X", parent="C", branch="yes", pos=0), _s("Y", parent="C", branch="yes", pos=1),
        _s("Z", parent="C", branch="no", pos=0),
    ]
    assert _next_step_id(_cond, "C", "yes") == "X"
    assert _next_step_id(_cond, "Y") == "D"   # walk up out of the yes-lane to C's next root sibling
    assert _next_step_id(_cond, "C", "no") == "Z"
    assert _next_step_id(_cond, "Z") == "D"
    assert _next_step_id(_cond, "C", "yes_empty") == "D"  # missing branch → fall through
    print("automation_engine: _next_step_id sanity checks pass")
