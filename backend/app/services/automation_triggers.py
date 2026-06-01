"""
Single entry-point for firing automation triggers from any inbound route.
Import and call `fire_trigger(...)` from webhook.py, telegram.py, instagram.py,
facebook.py, and leads.py.

All execution happens in a background task so the caller never blocks.
"""

import logging
from fastapi import BackgroundTasks

logger = logging.getLogger(__name__)


async def _dispatch(
    lead_id: str,
    tenant_id: str,
    trigger_type: str,
    message: str,
    is_first_message: bool,
    db,
) -> None:
    """Find matching active automations and run them."""
    try:
        from app.services.automation_engine import run_automation

        rows = (
            db.table("automations")
            .select("*")
            .eq("tenant_id", tenant_id)
            .eq("active", True)
            .execute()
        )
        automations = rows.data or []

        for auto in automations:
            ttype = auto["trigger_type"]

            # ── lead_created ───────────────────────────────────────────────
            if trigger_type == "lead_created" and ttype == "lead_created":
                await run_automation(auto, lead_id, trigger_type, message, db)

            # ── first_inbound_message ──────────────────────────────────────
            elif trigger_type == "new_message_received" and is_first_message and ttype == "first_inbound_message":
                await run_automation(auto, lead_id, "first_inbound_message", message, db)

            # ── new_message_received ───────────────────────────────────────
            elif trigger_type == "new_message_received" and ttype == "new_message_received":
                await run_automation(auto, lead_id, trigger_type, message, db)

            # ── keyword_match ──────────────────────────────────────────────
            elif trigger_type == "new_message_received" and ttype == "keyword_match":
                cfg = auto.get("trigger_config") or {}
                keywords: list[str] = [k.lower().strip() for k in (cfg.get("keywords") or [])]
                match_type: str = cfg.get("match_type", "any")
                match_mode: str = cfg.get("match_mode", "contains")  # "contains" or "exact"
                text_lower = (message or "").lower().strip()

                def _kw_match(kw: str) -> bool:
                    if match_mode == "exact":
                        return text_lower == kw
                    return kw in text_lower  # contains (default)

                if keywords:
                    if match_type == "all":
                        matched = all(_kw_match(kw) for kw in keywords)
                    else:
                        matched = any(_kw_match(kw) for kw in keywords)
                    if matched:
                        await run_automation(auto, lead_id, "keyword_match", message, db)

            # ── score_threshold ────────────────────────────────────────────
            elif trigger_type == "score_threshold" and ttype == "score_threshold":
                cfg = auto.get("trigger_config") or {}
                threshold = float(cfg.get("threshold", 7))
                operator = cfg.get("operator", "gte")  # gte or lte
                score_row = db.table("leads").select("score").eq("id", lead_id).maybe_single().execute()
                current_score = float((score_row.data or {}).get("score") or 0)
                matched = (current_score >= threshold) if operator == "gte" else (current_score <= threshold)
                if matched:
                    await run_automation(auto, lead_id, trigger_type, message, db)

            # ── segment_changed ────────────────────────────────────────────
            elif trigger_type == "segment_changed" and ttype == "segment_changed":
                cfg = auto.get("trigger_config") or {}
                to_seg = cfg.get("to_segment")
                extra = db.table("leads").select("segment").eq("id", lead_id).maybe_single().execute()
                current_seg = (extra.data or {}).get("segment")
                if not to_seg or current_seg == to_seg:
                    await run_automation(auto, lead_id, trigger_type, message, db)

    except Exception as e:
        logger.error(f"Automation dispatch failed [{trigger_type}] lead={lead_id}: {e}")


def fire_trigger(
    background_tasks: BackgroundTasks,
    lead_id: str,
    tenant_id: str,
    trigger_type: str,
    message: str = "",
    is_first_message: bool = False,
    db=None,
) -> None:
    """Schedule trigger dispatch as a background task (non-blocking)."""
    from app.db.supabase import get_supabase
    db = db or get_supabase()
    background_tasks.add_task(
        _dispatch,
        lead_id=lead_id,
        tenant_id=tenant_id,
        trigger_type=trigger_type,
        message=message,
        is_first_message=is_first_message,
        db=db,
    )
