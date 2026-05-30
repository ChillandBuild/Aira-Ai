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


def _interpolate(text: str, lead_data: dict) -> str:
    return (text or "").replace(
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


def _record_outbound(db, step, lead_data, source, content, sid, automation_id) -> None:
    """Insert the outbound messages row and bump per-node counters. Never raises."""
    step_id = step["id"]
    if sid:
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
    field = "sent_count" if sid else "error_count"
    try:
        db.rpc("bump_automation_step_counter", {"p_step_id": step_id, "p_field": field, "p_delta": 1}).execute()
    except Exception as e:
        logger.warning(f"counter bump ({field}) failed for step {step_id}: {e}")


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
        text = _interpolate(text, lead_data)
        try:
            sid = await _send_text_via_channel(source, lead_data, text, tenant_id)
            _record_outbound(db, step, lead_data, source, text, sid, automation_id)
            return {"status": "ok", "detail": f"sent sid={sid}"}
        except Exception as e:
            logger.error(f"automation send_message failed for lead {lead_id}: {e}")
            _record_outbound(db, step, lead_data, source, text, None, automation_id)
            return {"status": "error", "detail": str(e)}

    # ── send_image / send_video ────────────────────────────────────────────
    if step_type in ("send_image", "send_video"):
        url_val = config.get("url", "")
        if not url_val:
            return {"status": "error", "detail": "empty url"}
        caption = _interpolate(config.get("caption", ""), lead_data) or None
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
            return {"status": "ok", "detail": f"sent {wa_type} sid={sid}"}
        except Exception as e:
            logger.error(f"automation {step_type} failed for lead {lead_id}: {e}")
            _record_outbound(db, step, lead_data, source, url_val, None, automation_id)
            return {"status": "error", "detail": str(e)}

    # ── send_file ──────────────────────────────────────────────────────────
    if step_type == "send_file":
        url_val = config.get("url", "")
        if not url_val:
            return {"status": "error", "detail": "empty url"}
        caption = _interpolate(config.get("caption", ""), lead_data) or None
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
            return {"status": "ok", "detail": f"sent file sid={sid}"}
        except Exception as e:
            logger.error(f"automation send_file failed for lead {lead_id}: {e}")
            _record_outbound(db, step, lead_data, source, url_val, None, automation_id)
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
            return {"status": "ok", "detail": f"sent location sid={sid}"}
        except Exception as e:
            logger.error(f"automation send_location failed for lead {lead_id}: {e}")
            _record_outbound(db, step, lead_data, source, _maps_link(lat, lon), None, automation_id)
            return {"status": "error", "detail": str(e)}

    # ── cta_url ────────────────────────────────────────────────────────────
    if step_type == "cta_url":
        body = _interpolate(config.get("body", ""), lead_data)
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
            return {"status": "ok", "detail": f"sent cta_url sid={sid}"}
        except Exception as e:
            logger.error(f"automation cta_url failed for lead {lead_id}: {e}")
            _record_outbound(db, step, lead_data, source, body, None, automation_id)
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


# ─── Main executor ───────────────────────────────────────────────────────────

async def _run_steps(
    steps_flat: list[dict],
    root_steps: list[dict],
    lead_data: dict,
    message: str,
    db,
    automation_id: str,
    context: dict,
) -> list[dict]:
    """Recursively execute a step tree; return list of step result dicts."""
    results: list[dict] = []

    async def walk(step_list: list[dict]) -> None:
        for step in step_list:
            result = await _execute_step(step, lead_data, message, db, context)
            result["step_id"] = step["id"]
            result["step_type"] = step["step_type"]
            results.append(result)

            if result.get("status") == "wait":
                # Schedule pending execution for the NEXT sibling after this step
                # (simplification: queue the rest of the current branch from here)
                run_at = result.get("run_at")
                try:
                    db.table("automation_pending_executions").insert({
                        "automation_id": automation_id,
                        "lead_id": str(lead_data["id"]),
                        "resume_step_id": step["id"],
                        "tenant_id": str(lead_data["tenant_id"]),
                        "run_at": run_at,
                        "status": "pending",
                        "context": {**context, "message": message},
                    }).execute()
                except Exception as e:
                    logger.error(f"Failed to queue pending execution: {e}")
                return  # Stop this branch; resume later

            if result.get("status") == "ok" and step["step_type"] == "condition":
                branch = result.get("branch", "yes")
                branch_children = _children(steps_flat, step["id"], branch)
                await walk(branch_children)
            elif step["step_type"] != "condition":
                pass  # linear steps: continue to next in list

    await walk(root_steps)
    return results


async def run_automation(
    automation: dict,
    lead_id: str,
    trigger_type: str,
    message: str,
    db=None,
) -> None:
    """Execute one automation against a lead. Logs outcome."""
    db = db or get_supabase()
    automation_id = str(automation["id"])
    tenant_id = str(automation["tenant_id"])

    lead_row = (
        db.table("leads")
        .select("id,name,phone,source,segment,score,tenant_id,assigned_to,tg_user_id,ig_user_id,fb_user_id")
        .eq("id", lead_id)
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )
    if not lead_row.data:
        logger.warning(f"Automation {automation_id}: lead {lead_id} not found")
        return

    lead_data = lead_row.data

    steps_res = (
        db.table("automation_steps")
        .select("*")
        .eq("automation_id", automation_id)
        .order("position")
        .execute()
    )
    steps_flat = steps_res.data or []
    root_steps = _build_tree(steps_flat)

    overall_status = "success"
    steps_results: list[dict] = []
    try:
        steps_results = await _run_steps(
            steps_flat, root_steps, lead_data, message, db, automation_id,
            {"automation_id": automation_id},
        )
        if any(r.get("status") == "error" for r in steps_results):
            overall_status = "partial" if any(r.get("status") == "ok" for r in steps_results) else "failure"
    except Exception as e:
        logger.error(f"Automation {automation_id} execution error: {e}")
        overall_status = "failure"
        steps_results.append({"status": "error", "detail": str(e)})

    try:
        db.table("automations").update({
            "run_count": (automation.get("run_count") or 0) + 1,
            "subscriber_count": (automation.get("subscriber_count") or 0) + 1,
        }).eq("id", automation_id).execute()
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


async def resume_pending_executions(db=None) -> int:
    """Process due pending executions. Called by cron endpoint. Returns count processed."""
    db = db or get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    due = (
        db.table("automation_pending_executions")
        .select("*")
        .eq("status", "pending")
        .lte("run_at", now)
        .limit(50)
        .execute()
    )
    processed = 0
    for pending in (due.data or []):
        try:
            db.table("automation_pending_executions").update(
                {"status": "running"}
            ).eq("id", pending["id"]).execute()

            auto_row = (
                db.table("automations")
                .select("*")
                .eq("id", pending["automation_id"])
                .maybe_single()
                .execute()
            )
            if not auto_row.data or not auto_row.data.get("active"):
                db.table("automation_pending_executions").update(
                    {"status": "done"}
                ).eq("id", pending["id"]).execute()
                continue

            context = pending.get("context") or {}
            message = context.pop("message", "")
            await run_automation(
                auto_row.data,
                lead_id=pending["lead_id"],
                trigger_type=auto_row.data["trigger_type"],
                message=message,
                db=db,
            )
            db.table("automation_pending_executions").update(
                {"status": "done"}
            ).eq("id", pending["id"]).execute()
            processed += 1
        except Exception as e:
            logger.error(f"Failed to resume pending execution {pending['id']}: {e}")
            db.table("automation_pending_executions").update(
                {"status": "failed"}
            ).eq("id", pending["id"]).execute()

    return processed
