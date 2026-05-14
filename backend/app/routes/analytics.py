"""
Analytics routes — service metrics for WhatsApp, telecalling, and lead funnel.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


def _today_start() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _week_start() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()


@router.get("/whatsapp")
async def whatsapp_analytics(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    today = _today_start()

    msgs_today = (
        db.table("messages")
        .select("id,direction,is_ai_generated")
        .eq("tenant_id", tenant_id)
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
        .eq("tenant_id", tenant_id)
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
async def telecalling_analytics(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    today = _today_start()
    week = _week_start()

    logs_today_res = (
        db.table("call_logs")
        .select("id,duration_seconds,outcome,caller_id")
        .eq("tenant_id", tenant_id)
        .gte("created_at", today)
        .execute()
        .data or []
    )

    logs_week_res = (
        db.table("call_logs")
        .select("id")
        .eq("tenant_id", tenant_id)
        .gte("created_at", week)
        .execute()
        .data or []
    )

    all_logs_res = (
        db.table("call_logs")
        .select("id,duration_seconds,outcome,caller_id")
        .eq("tenant_id", tenant_id)
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
        .eq("tenant_id", tenant_id)
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
async def funnel_analytics(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    week = _week_start()

    leads_all = (
        db.table("leads")
        .select("id,segment,source,score,created_at")
        .eq("tenant_id", tenant_id)
        .execute()
        .data or []
    )

    total_leads = len(leads_all)

    by_segment: dict[str, int] = {"A": 0, "B": 0, "C": 0, "D": 0}
    by_source: dict[str, int] = {"whatsapp": 0, "instagram": 0, "upload": 0, "manual": 0}
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


@router.get("/overview")
async def overview_analytics(tenant_id: str = Depends(get_tenant_id)):
    """Dashboard root — KPIs and 7-day series."""
    db = get_supabase()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start_dt = now - timedelta(days=7)
    seven_day_iso = [(now - timedelta(days=i)).date().isoformat() for i in range(6, -1, -1)]

    leads_rows = (
        db.table("leads")
        .select("id,phone,segment,score,created_at,converted_at,ai_enabled,deleted_at")
        .eq("tenant_id", tenant_id)
        .is_("deleted_at", "null")
        .execute()
        .data or []
    )

    daily_leads_map = {d: 0 for d in seven_day_iso}
    converted_7d = 0
    funnel_inquiries = 0
    funnel_engaged = 0
    funnel_hot = 0
    funnel_converted = 0
    for lead in leads_rows:
        created = (lead.get("created_at") or "")[:10]
        if created in daily_leads_map:
            daily_leads_map[created] += 1
        if lead.get("converted_at") and lead["converted_at"] >= week_start_dt.isoformat():
            converted_7d += 1
            funnel_converted += 1
        seg = lead.get("segment")
        funnel_inquiries += 1
        if seg in ("A", "B"):
            funnel_engaged += 1
        if seg == "A":
            funnel_hot += 1

    msgs_week = (
        db.table("messages")
        .select("id,direction,is_ai_generated,created_at,lead_id")
        .eq("tenant_id", tenant_id)
        .gte("created_at", week_start_dt.isoformat())
        .execute()
        .data or []
    )

    daily_msgs_map = {d: {"inbound": 0, "outbound": 0} for d in seven_day_iso}
    ai_count = 0
    human_count = 0
    ai_handled_today = 0
    for m in msgs_week:
        day = (m.get("created_at") or "")[:10]
        if day in daily_msgs_map:
            direction = m.get("direction")
            if direction == "inbound":
                daily_msgs_map[day]["inbound"] += 1
            elif direction == "outbound":
                daily_msgs_map[day]["outbound"] += 1
        if m.get("direction") == "outbound":
            if m.get("is_ai_generated"):
                ai_count += 1
                if (m.get("created_at") or "") >= today_start.isoformat():
                    ai_handled_today += 1
            else:
                human_count += 1

    last_inbound: dict[str, str] = {}
    last_outbound: dict[str, str] = {}
    day_ago_iso = (now - timedelta(hours=24)).isoformat()
    for m in msgs_week:
        ts = m.get("created_at") or ""
        if ts < day_ago_iso:
            continue
        lid = m.get("lead_id")
        if not lid:
            continue
        if m.get("direction") == "inbound":
            if ts > last_inbound.get(lid, ""):
                last_inbound[lid] = ts
        elif m.get("direction") == "outbound":
            if ts > last_outbound.get(lid, ""):
                last_outbound[lid] = ts

    unreplied_24h = sum(
        1 for lid, ts in last_inbound.items()
        if last_outbound.get(lid, "") < ts
    )

    return {
        "daily_leads": [{"day": d, "count": daily_leads_map[d]} for d in seven_day_iso],
        "daily_messages": [
            {"day": d, "inbound": daily_msgs_map[d]["inbound"], "outbound": daily_msgs_map[d]["outbound"]}
            for d in seven_day_iso
        ],
        "funnel": {
            "inquiries": funnel_inquiries,
            "engaged": funnel_engaged,
            "hot": funnel_hot,
            "converted": funnel_converted,
        },
        "ai_vs_human": {"ai": ai_count, "human": human_count},
        "unreplied_24h": unreplied_24h,
        "converted_7d": converted_7d,
        "ai_handled_today": ai_handled_today,
    }


@router.get("/ad-performance")
async def ad_performance_summary(tenant_id: str = Depends(get_tenant_id)):
    """Stub — ad attribution to be wired when an Ads source/UTM column exists."""
    return {
        "campaigns": [],
        "total_spend": 0,
        "total_conversions": 0,
        "cost_per_conversion": None,
    }
