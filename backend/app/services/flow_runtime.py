"""Bot Flow Builder Phase 2 — inbound resume.

When a lead has a flow run paused on a user_input/interactive node, their next inbound
message belongs to the flow, not the AI reply pipeline. resume_for_inbound() captures
the reply (into a variable, or a branch for interactive) and continues the run.

Returns True when a waiting flow consumed the message — the caller MUST then suppress
both the new_message_received trigger fan-out AND generate_reply for that message.
"""
import logging

from app.services import automation_engine as eng

logger = logging.getLogger(__name__)


def _find_waiting_run(db, lead_id: str, tenant_id: str) -> dict | None:
    res = (
        db.table("automation_flow_runs")
        .select("*")
        .eq("lead_id", lead_id)
        .eq("tenant_id", tenant_id)
        .eq("status", "waiting_reply")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    return rows[0] if rows else None


async def resume_for_inbound(lead_id: str, tenant_id: str, message: str, db) -> bool:
    """If a flow run is waiting on this lead's reply, capture it and resume. Returns
    True if the message was consumed by a flow (caller suppresses trigger + AI reply)."""
    try:
        from app.config_dynamic import get_setting
        if get_setting("bot_auto_reply_enabled", fallback="false", tenant_id=tenant_id) == "false":
            return False

        run = _find_waiting_run(db, lead_id, tenant_id)
        if not run:
            return False

        automation_id = str(run["automation_id"])
        auto = (
            db.table("automations")
            .select("id,active,trigger_type,tenant_id")
            .eq("id", automation_id)
            .eq("tenant_id", tenant_id)
            .maybe_single()
            .execute()
        )
        if not auto.data or not auto.data.get("active"):
            # Flow was deactivated while waiting — abandon the run, let normal reply run.
            db.table("automation_flow_runs").update({"status": "done"}).eq("id", run["id"]).execute()
            return False

        steps_flat = eng._load_steps_flat(db, automation_id)
        by_id = {s["id"]: s for s in steps_flat}
        node = by_id.get(run.get("current_step_id"))
        if not node:
            db.table("automation_flow_runs").update({"status": "failed"}).eq("id", run["id"]).execute()
            return False

        variables = run.get("variables") or {}
        node_type = node["step_type"]
        config = node.get("config") or {}

        if node_type == "ai_agent":
            # Re-run the SAME agent node with the inbound; the agent loop consumes the
            # reply (via its awaiting state) and decides to pause again or finish.
            next_id = node["id"]
        elif node_type == "interactive":
            branch = _match_interactive_choice(config, message)
            if branch is None:
                # Reply matched no button — keep waiting (the lead should tap a button).
                # Don't advance and don't corrupt save_as; consume so no AI reply fires.
                logger.info(f"interactive node {node['id']}: reply matched no button; staying waiting_reply")
                return True
            save_as = config.get("save_as")
            if save_as:
                variables[save_as] = message
            next_id = eng._next_step_id(steps_flat, node["id"], branch)
        elif node_type == "send_list":
            # WhatsApp delivers the selected row id as the reply body (list_reply.id).
            # On text channels (fallback menus) it's the user's typed number/text.
            save_as = config.get("save_as")
            if save_as:
                variables[save_as] = message
            next_id = eng._next_step_id(steps_flat, node["id"])
        elif node_type == "user_input":
            save_as = config.get("save_as")
            if save_as:
                variables[save_as] = message
            next_id = eng._next_step_id(steps_flat, node["id"])
        else:
            # Not an input node — shouldn't be waiting_reply; advance linearly to be safe.
            next_id = eng._next_step_id(steps_flat, node["id"])

        # CAS: only the worker that flips waiting_reply→running drives the run. A
        # concurrent duplicate delivery loses the race (no rows updated) and just
        # suppresses its own AI reply without double-driving.
        upd = (
            db.table("automation_flow_runs")
            .update({
                "status": "running",
                "current_step_id": next_id,
                "variables": variables,
                "trigger_message": message,
                "updated_at": eng._now_iso(),
            })
            .eq("id", run["id"])
            .eq("status", "waiting_reply")
            .execute()
        )
        if not (upd.data or []):
            logger.info(f"flow_run {run['id']}: lost waiting_reply race; suppressing without re-driving")
            return True

        run["variables"] = variables
        run["current_step_id"] = next_id
        run["trigger_message"] = message
        await eng._drive_run(run, db, auto.data.get("trigger_type") or "")
        return True
    except Exception as e:
        logger.error(f"resume_for_inbound failed for lead {lead_id}: {e}")
        return False


def _match_interactive_choice(config: dict, message: str) -> str | None:
    """Map an inbound reply to a button id (the branch label). Matches by button id,
    title, or 1-based number (for text-degraded menus on non-WhatsApp channels)."""
    buttons = config.get("buttons") or []
    msg = (message or "").strip().lower()
    for i, b in enumerate(buttons):
        bid = str(b.get("id", "")).lower()
        title = str(b.get("title", "")).lower()
        if msg and (msg == bid or msg == title):
            return str(b.get("id"))
        if msg == str(i + 1):  # numbered menu fallback
            return str(b.get("id"))
    return None
