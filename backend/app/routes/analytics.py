"""
Analytics routes — service metrics for WhatsApp, telecalling, and lead funnel.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter()


def _today_start() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _week_start() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()


@router.get("/whatsapp")
async def whatsapp_analytics():
    db = get_supabase()
    today = _today_start()

    msgs_today = (
        db.table("messages")
        .select("id,direction,is_ai_generated")
        .gte("created_at", today)
        .execute()
        .data or []
    )

    messages_sent_today = sum(1 for m in msgs_today if m.get("direction") == "outbound")
    messages_received_today = sum(1 for m in msgs_today if m.get("direction") == "inbound")
    ai_reply_count_today = sum(
        1 for m in msgs_today
        if m.get("direction") == "outbound" and m.get("is_ai_generated")
    )

    faqs_res = (
        db.table("faqs")
        .select("question,hit_count")
        .order("hit_count", desc=True)
        .limit(5)
        .execute()
        .data or []
    )

    return {
        "messages_sent_today": messages_sent_today,
        "messages_received_today": messages_received_today,
        "ai_reply_count_today": ai_reply_count_today,
        "avg_reply_time_seconds": None,
        "top_faqs": [{"question": f.get("question"), "hit_count": f.get("hit_count", 0)} for f in faqs_res],
    }


@router.get("/telecalling")
async def telecalling_analytics():
    db = get_supabase()
    today = _today_start()
    week = _week_start()

    logs_today_res = (
        db.table("call_logs")
        .select("id,duration_seconds,outcome,caller_id")
        .gte("created_at", today)
        .execute()
        .data or []
    )

    logs_week_res = (
        db.table("call_logs")
        .select("id")
        .gte("created_at", week)
        .execute()
        .data or []
    )

    all_logs_res = (
        db.table("call_logs")
        .select("id,duration_seconds,outcome,caller_id")
        .execute()
        .data or []
    )

    calls_today = len(logs_today_res)
    calls_this_week = len(logs_week_res)

    durations = [l["duration_seconds"] for l in all_logs_res if l.get("duration_seconds") is not None]
    avg_duration_seconds = round(sum(durations) / len(durations)) if durations else None

    outcome_breakdown = {"converted": 0, "callback": 0, "not_interested": 0, "no_answer": 0}
    for log in all_logs_res:
        outcome = log.get("outcome")
        if outcome in outcome_breakdown:
            outcome_breakdown[outcome] += 1

    callers_res = (
        db.table("callers")
        .select("id,name,overall_score")
        .eq("active", True)
        .execute()
        .data or []
    )

    today_counts: dict[str, int] = {}
    for log in logs_today_res:
        cid = log.get("caller_id")
        if cid:
            today_counts[cid] = today_counts.get(cid, 0) + 1

    per_caller = [
        {
            "caller_id": c["id"],
            "name": c.get("name"),
            "calls_today": today_counts.get(c["id"], 0),
            "overall_score": c.get("overall_score"),
        }
        for c in callers_res
    ]

    return {
        "calls_today": calls_today,
        "calls_this_week": calls_this_week,
        "avg_duration_seconds": avg_duration_seconds,
        "outcome_breakdown": outcome_breakdown,
        "per_caller": per_caller,
    }


@router.get("/funnel")
async def funnel_analytics():
    db = get_supabase()
    week = _week_start()

    leads_all = (
        db.table("leads")
        .select("id,segment,source,score,created_at")
        .execute()
        .data or []
    )

    total_leads = len(leads_all)

    by_segment: dict[str, int] = {"A": 0, "B": 0, "C": 0, "D": 0}
    by_source: dict[str, int] = {"whatsapp": 0, "instagram": 0, "upload": 0}
    scores = []
    leads_this_week = 0

    for lead in leads_all:
        seg = lead.get("segment")
        if seg in by_segment:
            by_segment[seg] += 1

        src = lead.get("source")
        if src in by_source:
            by_source[src] += 1

        score = lead.get("score")
        if score is not None:
            scores.append(score)

        if (lead.get("created_at") or "") >= week:
            leads_this_week += 1

    avg_score = round(sum(scores) / len(scores), 1) if scores else None

    return {
        "total_leads": total_leads,
        "by_segment": by_segment,
        "by_source": by_source,
        "leads_this_week": leads_this_week,
        "avg_score": avg_score,
    }
