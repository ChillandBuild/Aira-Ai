"""
Analytics routes — service metrics for WhatsApp, telecalling, and lead funnel.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()

IST_OFFSET = timedelta(hours=5, minutes=30)


def _today_start() -> str:
    now = datetime.now(timezone.utc)
    return now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()


def _week_start() -> str:
    return (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()


def _range_params(range_str: str) -> tuple[datetime, list[str]]:
    """Return (window_start_utc, list_of_date_iso_strings) for a range value."""
    now = datetime.now(timezone.utc)
    if range_str == "today":
        start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
        days_iso = [now.date().isoformat()]
    elif range_str == "30d":
        start_dt = now - timedelta(days=30)
        days_iso = [(now - timedelta(days=i)).date().isoformat() for i in range(29, -1, -1)]
    else:  # default "7d"
        start_dt = now - timedelta(days=7)
        days_iso = [(now - timedelta(days=i)).date().isoformat() for i in range(6, -1, -1)]
    return start_dt, days_iso


def _ist_hour(utc_iso: str) -> int:
    """Convert a UTC ISO string to IST hour (int)."""
    try:
        dt = datetime.fromisoformat(utc_iso.replace("Z", "+00:00"))
        ist = dt + IST_OFFSET
        return ist.hour
    except Exception:
        return -1


def _ist_date(utc_iso: str) -> str:
    """Convert a UTC ISO string to IST date string YYYY-MM-DD."""
    try:
        dt = datetime.fromisoformat(utc_iso.replace("Z", "+00:00"))
        ist = dt + IST_OFFSET
        return ist.date().isoformat()
    except Exception:
        return ""


def _ist_today_start_utc() -> datetime:
    """Midnight IST expressed as a UTC datetime."""
    now_utc = datetime.now(timezone.utc)
    now_ist = now_utc + IST_OFFSET
    midnight_ist = now_ist.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight_ist - IST_OFFSET


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

    return {
        "messages_sent_today": messages_sent_today,
        "messages_received_today": messages_received_today,
        "ai_reply_count_today": ai_reply_count_today,
        "avg_reply_time_seconds": None,
        "top_faqs": [],
    }


@router.get("/telecalling")
async def telecalling_analytics(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    today = _today_start()
    week = _week_start()

    logs_today_res = (
        db.table("call_logs")
        .select("id,duration_seconds,outcome,caller_id,created_at")
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

    # IST today midnight (in UTC) for filtering calls that fall in IST today
    ist_today_utc = _ist_today_start_utc()
    ist_today_utc_iso = ist_today_utc.replace(tzinfo=None).isoformat()

    today_counts: dict[str, int] = {}
    today_durations: dict[str, list[int]] = {}
    for log in logs_today_res:
        cid = log.get("caller_id")
        if cid:
            today_counts[cid] = today_counts.get(cid, 0) + 1
            dur = log.get("duration_seconds")
            if dur is not None:
                today_durations.setdefault(cid, []).append(dur)

    # total_minutes_today (tenant-wide)
    today_dur_all = [
        l["duration_seconds"] for l in logs_today_res
        if l.get("duration_seconds") is not None
    ]
    total_minutes_today = round(sum(today_dur_all) / 60, 1) if today_dur_all else 0.0

    # calls_per_hour — IST hours 9–18, today's calls
    hour_counts: dict[int, int] = {h: 0 for h in range(9, 19)}
    # calls_per_slot — 30-min slots 09:00–17:30 (18 slots)
    slots = [f"{h:02d}:{m:02d}" for h in range(9, 18) for m in (0, 30)]
    slot_counts: dict[str, int] = {s: 0 for s in slots}
    slot_caller_counts: dict[str, dict[str, int]] = {s: {} for s in slots}

    for log in logs_today_res:
        raw_ts = log.get("created_at") or ""
        if not raw_ts:
            continue
        ist_h = _ist_hour(raw_ts)
        if ist_h in hour_counts:
            hour_counts[ist_h] += 1
        # determine slot
        try:
            dt = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
            ist_dt = dt + IST_OFFSET
            slot_min = 0 if ist_dt.minute < 30 else 30
            slot_key = f"{ist_dt.hour:02d}:{slot_min:02d}"
            if slot_key in slot_counts:
                slot_counts[slot_key] += 1
                cid = log.get("caller_id")
                if cid:
                    slot_caller_counts[slot_key][cid] = slot_caller_counts[slot_key].get(cid, 0) + 1
        except Exception:
            pass

    hour_labels = {
        9: "9 AM", 10: "10 AM", 11: "11 AM", 12: "12 PM",
        13: "1 PM", 14: "2 PM", 15: "3 PM", 16: "4 PM",
        17: "5 PM", 18: "6 PM",
    }
    calls_per_hour = [
        {"hour": h, "label": hour_labels[h], "count": hour_counts[h]}
        for h in range(9, 19)
    ]
    calls_per_slot = [
        {"slot": s, "count": slot_counts[s], "caller_counts": slot_caller_counts[s]}
        for s in slots
    ]

    # per-caller conversion rates (all-time)
    caller_total: dict[str, int] = {}
    caller_converted: dict[str, int] = {}
    for log in all_logs_res:
        cid = log.get("caller_id")
        if not cid:
            continue
        caller_total[cid] = caller_total.get(cid, 0) + 1
        if log.get("outcome") == "converted":
            caller_converted[cid] = caller_converted.get(cid, 0) + 1

    per_caller = []
    for c in callers_res:
        cid = c["id"]
        total = caller_total.get(cid, 0)
        converted = caller_converted.get(cid, 0)
        conv_rate = round(converted / total, 4) if total > 0 else None
        dur_list = today_durations.get(cid, [])
        caller_minutes_today = round(sum(dur_list) / 60, 1) if dur_list else 0.0
        per_caller.append({
            "caller_id": cid,
            "name": c.get("name"),
            "calls_today": today_counts.get(cid, 0),
            "overall_score": c.get("overall_score"),
            "total_minutes_today": caller_minutes_today,
            "conversion_rate": conv_rate,
        })

    return {
        "calls_today": calls_today,
        "calls_this_week": calls_this_week,
        "avg_duration_seconds": avg_duration_seconds,
        "outcome_breakdown": outcome_breakdown,
        "per_caller": per_caller,
        "total_minutes_today": total_minutes_today,
        "calls_per_hour": calls_per_hour,
        "calls_per_slot": calls_per_slot,
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
    by_source: dict[str, int] = {
        "whatsapp": 0, "instagram": 0, "facebook": 0,
        "telegram": 0, "upload": 0, "manual": 0,
    }
    scores = []
    leads_this_week = 0
    score_histogram_raw: dict[str, int] = {
        "1-2": 0, "3-4": 0, "5-6": 0, "7-8": 0, "9-10": 0,
    }

    now = datetime.now(timezone.utc)
    hot_aging: dict[str, int] = {"<1d": 0, "1-3d": 0, "3-7d": 0, "7d+": 0}

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
            if 1 <= score <= 2:
                score_histogram_raw["1-2"] += 1
            elif 3 <= score <= 4:
                score_histogram_raw["3-4"] += 1
            elif 5 <= score <= 6:
                score_histogram_raw["5-6"] += 1
            elif 7 <= score <= 8:
                score_histogram_raw["7-8"] += 1
            elif 9 <= score <= 10:
                score_histogram_raw["9-10"] += 1

        if (lead.get("created_at") or "") >= week:
            leads_this_week += 1

        # hot lead aging for segment A
        if seg == "A":
            created_str = lead.get("created_at") or ""
            if created_str:
                try:
                    created_dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                    age_days = (now - created_dt.replace(tzinfo=timezone.utc if created_dt.tzinfo is None else created_dt.tzinfo)).days
                    if age_days < 1:
                        hot_aging["<1d"] += 1
                    elif age_days <= 3:
                        hot_aging["1-3d"] += 1
                    elif age_days <= 7:
                        hot_aging["3-7d"] += 1
                    else:
                        hot_aging["7d+"] += 1
                except Exception:
                    pass

    avg_score = round(sum(scores) / len(scores), 1) if scores else None

    score_histogram = [
        {"range": r, "count": score_histogram_raw[r]}
        for r in ("1-2", "3-4", "5-6", "7-8", "9-10")
    ]
    hot_lead_aging = [
        {"bucket": b, "count": hot_aging[b]}
        for b in ("<1d", "1-3d", "3-7d", "7d+")
    ]

    return {
        "total_leads": total_leads,
        "by_segment": by_segment,
        "by_source": by_source,
        "leads_this_week": leads_this_week,
        "avg_score": avg_score,
        "score_histogram": score_histogram,
        "hot_lead_aging": hot_lead_aging,
    }


@router.get("/overview")
async def overview_analytics(
    tenant_id: str = Depends(get_tenant_id),
    range: str = Query("7d"),
):
    """Dashboard root — KPIs and N-day series."""
    db = get_supabase()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    window_start_dt, days_iso = _range_params(range)

    leads_rows = (
        db.table("leads")
        .select("id,phone,segment,score,source,created_at,converted_at,ai_enabled,deleted_at")
        .eq("tenant_id", tenant_id)
        .is_("deleted_at", "null")
        .execute()
        .data or []
    )

    daily_leads_map = {d: 0 for d in days_iso}
    by_segment = {"A": 0, "B": 0, "C": 0, "D": 0}
    channel_breakdown = {
        "whatsapp": 0, "instagram": 0, "facebook": 0,
        "telegram": 0, "upload": 0, "manual": 0,
    }
    converted_7d = 0
    funnel_inquiries = 0
    funnel_engaged = 0
    funnel_hot = 0
    funnel_converted = 0
    week_start_for_funnel = now - timedelta(days=7)

    for lead in leads_rows:
        created = (lead.get("created_at") or "")[:10]
        if created in daily_leads_map:
            daily_leads_map[created] += 1
        if lead.get("converted_at") and lead["converted_at"] >= week_start_for_funnel.isoformat():
            converted_7d += 1
            funnel_converted += 1
        seg = lead.get("segment")
        if seg in by_segment:
            by_segment[seg] += 1
        src = lead.get("source")
        if src in channel_breakdown:
            channel_breakdown[src] += 1
        funnel_inquiries += 1
        if seg in ("A", "B"):
            funnel_engaged += 1
        if seg == "A":
            funnel_hot += 1

    total_leads = len(leads_rows)

    msgs_window = (
        db.table("messages")
        .select("id,direction,is_ai_generated,created_at,lead_id")
        .eq("tenant_id", tenant_id)
        .gte("created_at", window_start_dt.isoformat())
        .execute()
        .data or []
    )

    daily_msgs_map = {d: {"inbound": 0, "outbound": 0} for d in days_iso}
    ai_count = 0
    human_count = 0
    ai_handled_today = 0
    for m in msgs_window:
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
    for m in msgs_window:
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
        "daily_leads": [{"day": d, "count": daily_leads_map[d]} for d in days_iso],
        "daily_messages": [
            {"day": d, "inbound": daily_msgs_map[d]["inbound"], "outbound": daily_msgs_map[d]["outbound"]}
            for d in days_iso
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
        "by_segment": by_segment,
        "channel_breakdown": channel_breakdown,
        "total_leads": total_leads,
    }


@router.get("/messaging")
async def messaging_analytics(
    tenant_id: str = Depends(get_tenant_id),
    channel: str = Query("all"),
    range: str = Query("7d"),
):
    """Messaging analytics with optional channel filter and date range."""
    db = get_supabase()
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    window_start_dt, days_iso = _range_params(range)

    # Fetch messages within window
    q = (
        db.table("messages")
        .select("id,direction,is_ai_generated,reply_source,created_at,channel")
        .eq("tenant_id", tenant_id)
        .gte("created_at", window_start_dt.isoformat())
    )
    if channel != "all":
        q = q.eq("channel", channel)
    msgs = q.execute().data or []

    # sent_today / received_today — always from today regardless of range
    today_q = (
        db.table("messages")
        .select("id,direction")
        .eq("tenant_id", tenant_id)
        .gte("created_at", today_start.isoformat())
    )
    if channel != "all":
        today_q = today_q.eq("channel", channel)
    msgs_today = today_q.execute().data or []

    sent_today = sum(1 for m in msgs_today if m.get("direction") == "outbound")
    received_today = sum(1 for m in msgs_today if m.get("direction") == "inbound")

    # daily_messages series
    daily_msgs_map = {d: {"inbound": 0, "outbound": 0} for d in days_iso}
    outbound_total = 0
    outbound_ai = 0
    reply_source_counts: dict[str, int] = {"ai": 0, "knowledge": 0, "manual": 0, "unknown": 0}

    for m in msgs:
        day = (m.get("created_at") or "")[:10]
        if day in daily_msgs_map:
            direction = m.get("direction")
            if direction == "inbound":
                daily_msgs_map[day]["inbound"] += 1
            elif direction == "outbound":
                daily_msgs_map[day]["outbound"] += 1

        if m.get("direction") == "outbound":
            outbound_total += 1
            if m.get("is_ai_generated"):
                outbound_ai += 1

        # reply_source breakdown
        rs = m.get("reply_source")
        if rs in ("ai", "knowledge", "automation"):
            # treat "automation" as a sub-type; map to "ai" bucket if not already named
            key = rs if rs in reply_source_counts else "ai"
            reply_source_counts[key] += 1
        elif rs == "manual" or (rs is None and m.get("direction") == "outbound" and not m.get("is_ai_generated")):
            reply_source_counts["manual"] += 1
        elif rs is None:
            reply_source_counts["unknown"] += 1

    ai_reply_rate: float | None = round(outbound_ai / outbound_total, 4) if outbound_total > 0 else None

    return {
        "sent_today": sent_today,
        "received_today": received_today,
        "ai_reply_rate": ai_reply_rate,
        "reply_source_breakdown": reply_source_counts,
        "daily_messages": [
            {"day": d, "inbound": daily_msgs_map[d]["inbound"], "outbound": daily_msgs_map[d]["outbound"]}
            for d in days_iso
        ],
    }


@router.get("/ad-performance")
async def ad_performance_summary(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    from app.services.growth import build_ad_performance
    return build_ad_performance(tenant_id=tenant_id, db=db)
