"""
Insights routes — WhatsApp Business API metrics from Meta.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query

from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.meta_cloud import get_number_quality, get_whatsapp_insights

logger = logging.getLogger(__name__)
router = APIRouter()

USD_TO_INR = 83.5  # Fixed conversion rate; update as needed


def _date_range(range_str: str) -> tuple[str, str]:
    """Return (since, until) ISO dates for the given range."""
    now = datetime.now(timezone.utc)
    until = now.replace(hour=23, minute=59, second=59, microsecond=0)
    if range_str == "7d":
        since = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
    elif range_str == "30d":
        since = (now - timedelta(days=30)).replace(hour=0, minute=0, second=0, microsecond=0)
    else:
        since = (now - timedelta(days=7)).replace(hour=0, minute=0, second=0, microsecond=0)
    return since.isoformat(), until.isoformat()


@router.get("/whatsapp")
async def whatsapp_insights(
    range: str = Query("7d", alias="range"),
    since: str | None = Query(None),
    until: str | None = Query(None),
    tenant_id: str = Depends(get_tenant_id),
):
    """
    Fetch WhatsApp insights from Meta API for all tenant phone numbers.
    Query params:
      - range: 7d | 30d (default 7d)
      - since: ISO date (overrides range if provided)
      - until: ISO date (overrides range if provided)
    """
    db = get_supabase()

    if since and until:
        since_iso, until_iso = since, until
    else:
        since_iso, until_iso = _date_range(range)

    # Fetch all phone numbers for tenant
    numbers_result = (
        db.table("phone_numbers")
        .select("id,number,display_name,meta_phone_number_id")
        .eq("tenant_id", tenant_id)
        .neq("status", "archived")
        .order("role")
        .execute()
    )
    numbers = numbers_result.data or []

    # Fetch inbound message count from our DB for "received"
    msgs_result = (
        db.table("messages")
        .select("phone_number_id")
        .eq("tenant_id", tenant_id)
        .eq("direction", "inbound")
        .gte("created_at", since_iso)
        .lte("created_at", until_iso)
        .execute()
    )
    received_by_phone: dict[str, int] = {}
    for m in (msgs_result.data or []):
        pid = m.get("phone_number_id", "")
        received_by_phone[pid] = received_by_phone.get(pid, 0) + 1

    results = []
    totals = {
        "sent": 0,
        "delivered": 0,
        "read": 0,
        "received": 0,
        "cost_by_category": {
            "marketing": {"conversations": 0, "cost_inr": 0.0},
            "utility": {"conversations": 0, "cost_inr": 0.0},
            "authentication": {"conversations": 0, "cost_inr": 0.0},
            "authentication_international": {"conversations": 0, "cost_inr": 0.0},
            "ai_provider": {"conversations": 0, "cost_inr": 0.0},
            "service": {"conversations": 0, "cost_inr": 0.0},
        },
        "free_by_type": {
            "customer_service": {"conversations": 0, "cost_inr": 0.0},
            "entry_point": {"conversations": 0, "cost_inr": 0.0},
        },
        "paid_by_category": {
            "marketing": {"conversations": 0, "cost_inr": 0.0},
            "utility": {"conversations": 0, "cost_inr": 0.0},
            "authentication": {"conversations": 0, "cost_inr": 0.0},
            "authentication_international": {"conversations": 0, "cost_inr": 0.0},
            "ai_provider": {"conversations": 0, "cost_inr": 0.0},
        },
    }

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

        received = received_by_phone.get(meta_pid, 0)
        totals["received"] += received

        # Convert USD to INR
        def usd_to_inr(val: float) -> float:
            return round(val * USD_TO_INR, 2)

        def convert_costs(obj: dict) -> dict:
            return {k: {"conversations": v["conversations"], "cost_inr": usd_to_inr(v["cost_usd"])} for k, v in obj.items()}

        number_data = {
            "meta_phone_number_id": meta_pid,
            "display_name": num.get("display_name", ""),
            "number": num.get("number", ""),
            "quality_rating": quality.get("quality_rating", "UNKNOWN"),
            "messaging_tier": quality.get("messaging_tier", 0),
            "sent": insights.get("sent", 0),
            "delivered": insights.get("delivered", 0),
            "read": insights.get("read", 0),
            "received": received,
            "cost_by_category": convert_costs(insights.get("cost_by_category", {})),
            "free_by_type": convert_costs(insights.get("free_by_type", {})),
            "paid_by_category": convert_costs(insights.get("paid_by_category", {})),
        }
        results.append(number_data)

        # Aggregate totals
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

    # Round totals
    for cat in totals["cost_by_category"]:
        totals["cost_by_category"][cat]["cost_inr"] = round(totals["cost_by_category"][cat]["cost_inr"], 2)
    for ft in totals["free_by_type"]:
        totals["free_by_type"][ft]["cost_inr"] = round(totals["free_by_type"][ft]["cost_inr"], 2)
    for pc in totals["paid_by_category"]:
        totals["paid_by_category"][pc]["cost_inr"] = round(totals["paid_by_category"][pc]["cost_inr"], 2)

    return {
        "numbers": results,
        "totals": totals,
        "range": {"since": since_iso, "until": until_iso},
    }
