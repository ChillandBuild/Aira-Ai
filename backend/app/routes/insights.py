"""
Insights routes — WhatsApp Business API metrics from Meta.
"""

import logging
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Query

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.routes.app_settings import _get_setting_value
from app.services.meta_cloud import get_number_quality, get_whatsapp_insights

logger = logging.getLogger(__name__)
router = APIRouter()

USD_TO_INR = 83.5


def _date_range(range_str: str) -> tuple[str, str]:
    now = datetime.now(timezone.utc)
    until = now.replace(hour=23, minute=59, second=59, microsecond=0)
    if range_str == "7d":
        since = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_str == "30d":
        since = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        since = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
    return since.isoformat(), until.isoformat()


def _usd_to_inr(val: float) -> float:
    return round(val * USD_TO_INR, 2)


def _convert_costs(obj: dict) -> dict:
    return {k: {"conversations": v["conversations"], "cost_inr": _usd_to_inr(v["cost_usd"])} for k, v in obj.items()}


async def _sync_number_to_db(db, tenant_id: str, meta_pid: str, display_name: str, number: str, days: int = 30):
    """Fetch insights from Meta for the last N days and upsert snapshots into DB."""
    now = datetime.now(timezone.utc)
    until_date = now.date()
    since_date = until_date - timedelta(days=days)

    quality = await get_number_quality(phone_number_id=meta_pid, tenant_id=tenant_id)

    for day_offset in range(days + 1):
        day = since_date + timedelta(days=day_offset)
        day_since = datetime(day.year, day.month, day.day, 0, 0, 0, tzinfo=timezone.utc).isoformat()
        day_until = datetime(day.year, day.month, day.day, 23, 59, 59, tzinfo=timezone.utc).isoformat()

        try:
            insights = await get_whatsapp_insights(
                phone_number_id=meta_pid,
                tenant_id=tenant_id,
                since=day_since,
                until=day_until,
            )
        except Exception as e:
            logger.error(f"Insights fetch failed for {meta_pid} on {day}: {e}")
            continue

        cost_by_cat = insights.get("cost_by_category", {})
        free_by_type = insights.get("free_by_type", {})
        paid_by_cat = insights.get("paid_by_category", {})

        total_cost_inr = sum(
            _usd_to_inr(v.get("cost_usd", 0))
            for v in list(cost_by_cat.values()) + list(free_by_type.values()) + list(paid_by_cat.values())
        )

        snapshot = {
            "tenant_id": tenant_id,
            "meta_phone_number_id": meta_pid,
            "snapshot_date": day.isoformat(),
            "quality_rating": quality.get("quality_rating", "UNKNOWN"),
            "messaging_tier": quality.get("messaging_tier", 0),
            "sent": insights.get("sent", 0),
            "delivered": insights.get("delivered", 0),
            "read": insights.get("read", 0),
            "received": 0,
            "cost_by_category": cost_by_cat,
            "free_by_type": free_by_type,
            "paid_by_category": paid_by_cat,
            "total_cost_inr": total_cost_inr,
            "synced_at": now.isoformat(),
        }

        db.table("whatsapp_insights_snapshots").upsert(
            snapshot, on_conflict="meta_phone_number_id,snapshot_date"
        ).execute()


@router.get("/whatsapp")
async def whatsapp_insights(
    range: str = Query("7d", alias="range"),
    since: str | None = Query(None),
    until: str | None = Query(None),
    source: str = Query("db", alias="source"),
    tenant_id: str = Depends(get_tenant_id),
):
    """
    Fetch WhatsApp insights.
    source=meta: fetch from Meta API (default)
    source=db: fetch from DB snapshots
    """
    db = get_supabase()

    if since and until:
        since_iso, until_iso = since, until
    else:
        since_iso, until_iso = _date_range(range)

    numbers_result = (
        db.table("phone_numbers")
        .select("id,number,display_name,meta_phone_number_id")
        .eq("tenant_id", tenant_id)
        .neq("status", "archived")
        .order("role")
        .execute()
    )
    numbers = numbers_result.data or []

    # Fallback: if phone_numbers pool is empty, synthesise from app_settings
    if not numbers:
        meta_pid = _get_setting_value(db, tenant_id, "meta_phone_number_id")
        if meta_pid:
            numbers = [{
                "id": None,
                "number": meta_pid,
                "display_name": "Primary number",
                "meta_phone_number_id": meta_pid,
            }]

    if source == "db":
        return await _from_db(db, tenant_id, numbers, since_iso, until_iso)
    return await _from_meta(db, tenant_id, numbers, since_iso, until_iso)


async def _from_db(db, tenant_id: str, numbers: list, since_iso: str, until_iso: str):
    """Load insights from DB snapshots."""
    meta_pids = [n["meta_phone_number_id"] for n in numbers if n.get("meta_phone_number_id")]
    if not meta_pids:
        return {"numbers": [], "totals": _empty_totals(), "range": {"since": since_iso, "until": until_iso}}

    rows = (
        db.table("whatsapp_insights_snapshots")
        .select("*")
        .eq("tenant_id", tenant_id)
        .in_("meta_phone_number_id", meta_pids)
        .gte("snapshot_date", since_iso[:10])
        .lte("snapshot_date", until_iso[:10])
        .order("snapshot_date", desc=True)
        .execute()
    ).data or []

    by_number: dict[str, list] = {}
    for r in rows:
        pid = r["meta_phone_number_id"]
        by_number.setdefault(pid, []).append(r)

    results = []
    totals = _empty_totals()

    for num in numbers:
        meta_pid = num.get("meta_phone_number_id")
        if not meta_pid:
            continue
        snaps = by_number.get(meta_pid, [])
        if not snaps:
            continue
        latest = snaps[0]
        number_data = {
            "meta_phone_number_id": meta_pid,
            "display_name": num.get("display_name", ""),
            "number": num.get("number", ""),
            "quality_rating": latest.get("quality_rating", "UNKNOWN"),
            "messaging_tier": latest.get("messaging_tier", 0),
            "sent": latest.get("sent", 0),
            "delivered": latest.get("delivered", 0),
            "read": latest.get("read", 0),
            "received": latest.get("received", 0),
            "cost_by_category": latest.get("cost_by_category", {}),
            "free_by_type": latest.get("free_by_type", {}),
            "paid_by_category": latest.get("paid_by_category", {}),
            "snapshots": snaps,
        }
        results.append(number_data)
        totals["sent"] += number_data["sent"]
        totals["delivered"] += number_data["delivered"]
        totals["read"] += number_data["read"]
        totals["received"] += number_data["received"]

    return {"numbers": results, "totals": totals, "range": {"since": since_iso, "until": until_iso}}


async def _from_meta(db, tenant_id: str, numbers: list, since_iso: str, until_iso: str):
    """Fetch insights from Meta API and store snapshot for today."""
    # messages table has no phone_number_id column — count total inbound WA messages for the tenant
    msgs_result = (
        db.table("messages")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("direction", "inbound")
        .eq("channel", "whatsapp")
        .gte("created_at", since_iso)
        .lte("created_at", until_iso)
        .execute()
    )
    total_received = msgs_result.count or 0

    results = []
    totals = _empty_totals()
    totals["received"] = total_received

    for num in numbers:
        meta_pid = num.get("meta_phone_number_id")
        if not meta_pid:
            continue

        try:
            quality = await get_number_quality(phone_number_id=meta_pid, tenant_id=tenant_id)
            insights = await get_whatsapp_insights(
                phone_number_id=meta_pid,
                tenant_id=tenant_id,
                since=since_iso,
                until=until_iso,
            )
        except Exception as e:
            logger.error(f"Insights fetch failed for {meta_pid}: {e}")
            quality = {"quality_rating": "UNKNOWN", "messaging_tier": 0}
            insights = {}

        cost_by_cat = _convert_costs(insights.get("cost_by_category", {}))
        free_by_type = _convert_costs(insights.get("free_by_type", {}))
        paid_by_cat = _convert_costs(insights.get("paid_by_category", {}))

        number_data = {
            "meta_phone_number_id": meta_pid,
            "display_name": num.get("display_name", ""),
            "number": num.get("number", ""),
            "quality_rating": quality.get("quality_rating", "UNKNOWN"),
            "messaging_tier": quality.get("messaging_tier", 0),
            "sent": insights.get("sent", 0),
            "delivered": insights.get("delivered", 0),
            "read": insights.get("read", 0),
            "received": 0,  # no phone_number_id on messages; total is in totals.received
            "cost_by_category": cost_by_cat,
            "free_by_type": free_by_type,
            "paid_by_category": paid_by_cat,
        }
        results.append(number_data)

        totals["sent"] += number_data["sent"]
        totals["delivered"] += number_data["delivered"]
        totals["read"] += number_data["read"]
        for cat in totals["cost_by_category"]:
            totals["cost_by_category"][cat]["conversations"] += number_data["cost_by_category"].get(cat, {}).get("conversations", 0)
            totals["cost_by_category"][cat]["cost_inr"] += number_data["cost_by_category"].get(cat, {}).get("cost_inr", 0.0)
        for ft in totals["free_by_type"]:
            totals["free_by_type"][ft]["conversations"] += number_data["free_by_type"].get(ft, {}).get("conversations", 0)
            totals["free_by_type"][ft]["cost_inr"] += number_data["free_by_type"].get(ft, {}).get("cost_inr", 0.0)
        for pc in totals["paid_by_category"]:
            totals["paid_by_category"][pc]["conversations"] += number_data["paid_by_category"].get(pc, {}).get("conversations", 0)
            totals["paid_by_category"][pc]["cost_inr"] += number_data["paid_by_category"].get(pc, {}).get("cost_inr", 0.0)

        # Upsert today's snapshot
        today = datetime.now(timezone.utc).date().isoformat()
        total_cost_inr = sum(v["cost_inr"] for v in list(cost_by_cat.values()) + list(free_by_type.values()) + list(paid_by_cat.values()))
        db.table("whatsapp_insights_snapshots").upsert({
            "tenant_id": tenant_id,
            "meta_phone_number_id": meta_pid,
            "snapshot_date": today,
            "quality_rating": quality.get("quality_rating", "UNKNOWN"),
            "messaging_tier": quality.get("messaging_tier", 0),
            "sent": insights.get("sent", 0),
            "delivered": insights.get("delivered", 0),
            "read": insights.get("read", 0),
            "received": 0,
            "cost_by_category": insights.get("cost_by_category", {}),
            "free_by_type": insights.get("free_by_type", {}),
            "paid_by_category": insights.get("paid_by_category", {}),
            "total_cost_inr": total_cost_inr,
            "synced_at": datetime.now(timezone.utc).isoformat(),
        }, on_conflict="meta_phone_number_id,snapshot_date").execute()

    for cat in totals["cost_by_category"]:
        totals["cost_by_category"][cat]["cost_inr"] = round(totals["cost_by_category"][cat]["cost_inr"], 2)
    for ft in totals["free_by_type"]:
        totals["free_by_type"][ft]["cost_inr"] = round(totals["free_by_type"][ft]["cost_inr"], 2)
    for pc in totals["paid_by_category"]:
        totals["paid_by_category"][pc]["cost_inr"] = round(totals["paid_by_category"][pc]["cost_inr"], 2)

    return {"numbers": results, "totals": totals, "range": {"since": since_iso, "until": until_iso}}


def _empty_totals():
    return {
        "sent": 0, "delivered": 0, "read": 0, "received": 0,
        "cost_by_category": {k: {"conversations": 0, "cost_inr": 0.0} for k in ("marketing", "utility", "authentication", "authentication_international", "ai_provider", "service")},
        "free_by_type": {k: {"conversations": 0, "cost_inr": 0.0} for k in ("customer_service", "entry_point")},
        "paid_by_category": {k: {"conversations": 0, "cost_inr": 0.0} for k in ("marketing", "utility", "authentication", "authentication_international", "ai_provider")},
    }


@router.post("/sync")
async def sync_insights(tenant_id: str = Depends(get_tenant_id)):
    """Sync insights from Meta API for all phone numbers, backfill 30 days, store in DB."""
    db = get_supabase()
    numbers_result = (
        db.table("phone_numbers")
        .select("id,number,display_name,meta_phone_number_id")
        .eq("tenant_id", tenant_id)
        .neq("status", "archived")
        .execute()
    )
    numbers = numbers_result.data or []
    synced = []
    errors = []

    for num in numbers:
        meta_pid = num.get("meta_phone_number_id")
        if not meta_pid:
            continue
        try:
            await _sync_number_to_db(db, tenant_id, meta_pid, num.get("display_name", ""), num.get("number", ""))
            synced.append(meta_pid)
        except Exception as e:
            logger.error(f"Sync failed for {meta_pid}: {e}")
            errors.append({"meta_phone_number_id": meta_pid, "error": str(e)})

    return {"synced": synced, "errors": errors, "total": len(synced)}


@router.get("/trends")
async def trends_insights(
    range: str = Query("30d", alias="range"),
    tenant_id: str = Depends(get_tenant_id),
):
    """Return daily snapshots from DB for trend display."""
    db = get_supabase()
    now = datetime.now(timezone.utc)
    if range == "7d":
        since = (now - timedelta(days=7)).date().isoformat()
    elif range == "90d":
        since = (now - timedelta(days=90)).date().isoformat()
    else:
        since = (now - timedelta(days=30)).date().isoformat()
    until = now.date().isoformat()

    rows = (
        db.table("whatsapp_insights_snapshots")
        .select("*")
        .eq("tenant_id", tenant_id)
        .gte("snapshot_date", since)
        .lte("snapshot_date", until)
        .order("snapshot_date")
        .execute()
    ).data or []

    daily: dict[str, dict] = {}
    for r in rows:
        date = r["snapshot_date"]
        if date not in daily:
            daily[date] = {"date": date, "sent": 0, "delivered": 0, "read": 0, "received": 0, "cost_inr": 0.0, "quality_rating": "UNKNOWN"}
        daily[date]["sent"] += r.get("sent", 0)
        daily[date]["delivered"] += r.get("delivered", 0)
        daily[date]["read"] += r.get("read", 0)
        daily[date]["received"] += r.get("received", 0)
        daily[date]["cost_inr"] += float(r.get("total_cost_inr", 0))
        if r.get("quality_rating") and r["quality_rating"] != "UNKNOWN":
            daily[date]["quality_rating"] = r["quality_rating"]

    trend_list = sorted(daily.values(), key=lambda x: x["date"])
    for d in trend_list:
        d["cost_inr"] = round(d["cost_inr"], 2)

    return {"daily": trend_list, "range": {"since": since, "until": until}}


@router.get("/activity-log")
async def meta_activity_log(
    tenant_id: str = Depends(get_tenant_id),
    limit: int = Query(50, ge=1, le=200),
    after: str | None = Query(None),
):
    """
    Fetch Meta WhatsApp Manager activity log for the business/WABA.
    Returns entries with: time, user, category, activity description.
    """
    db = get_supabase()

    # Get credentials from settings
    access_token = _get_setting_value(db, tenant_id, "meta_access_token")
    waba_id = _get_setting_value(db, tenant_id, "meta_waba_id") or _get_setting_value(db, tenant_id, "whatsapp_business_account_id")

    if not access_token or not waba_id:
        return {"logs": [], "paging": None, "error": "Meta credentials not configured (need meta_access_token and meta_waba_id)"}

    params = {
        "access_token": access_token,
        "fields": "time,user,category,activity",
        "limit": limit,
    }
    if after:
        params["after"] = after

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://graph.facebook.com/v21.0/{waba_id}/audit_logs",
                params=params,
            )
        data = resp.json()

        if "error" in data:
            logger.error(f"Meta audit log error: {data['error']}")
            return {"logs": [], "paging": None, "error": data["error"].get("message", "Meta API error")}

        raw_logs = data.get("data", [])
        paging = data.get("paging")

        # Normalise entries
        logs = []
        for entry in raw_logs:
            logs.append({
                "time": entry.get("time"),
                "user": entry.get("user", {}).get("name", "Unknown") if isinstance(entry.get("user"), dict) else str(entry.get("user", "Unknown")),
                "category": entry.get("category", ""),
                "activity": entry.get("activity", ""),
            })

        return {"logs": logs, "paging": paging, "error": None}

    except Exception as e:
        logger.error(f"Meta audit log fetch error: {e}")
        return {"logs": [], "paging": None, "error": str(e)}
