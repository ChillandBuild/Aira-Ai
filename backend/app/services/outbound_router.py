import logging

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_TIER_DAILY_LIMITS: dict[int, int] = {1: 1_000, 2: 10_000, 3: 100_000}


async def get_best_number(tenant_id: str | None = None) -> dict | None:
    db = get_supabase()
    query = (
        db.table("phone_numbers")
        .select("*")
        .eq("status", "active")
        .neq("quality_rating", "red")
        .gte("warm_up_day", 14)
        .eq("paused_outbound", False)
    )
    if tenant_id:
        query = query.eq("tenant_id", tenant_id)
    rows = query.execute().data or []
    if not rows:
        logger.warning("No healthy outbound numbers available")
        return None

    def _sort_key(row: dict) -> tuple:
        # green before yellow (alphabetically, "green" < "yellow")
        quality_rank = 0 if row.get("quality_rating", "").lower() == "green" else 1
        tier = row.get("messaging_tier") or 1
        ratio = (row.get("daily_send_count") or 0) / tier
        return (quality_rank, ratio)

    rows = [
        r for r in rows
        if (r.get("daily_send_count") or 0) < _TIER_DAILY_LIMITS.get(r.get("messaging_tier") or 1, 1_000)
    ]
    if not rows:
        logger.warning("All outbound numbers have hit their daily tier limit")
        return None

    rows.sort(key=_sort_key)
    return rows[0]


async def increment_send_count(number_id: str) -> None:
    db = get_supabase()
    # Atomic increment via Postgres function to avoid read-modify-write races.
    db.rpc(
        "increment_phone_daily_send_count",
        {"row_id": number_id},
    ).execute()


async def reset_daily_counts() -> None:
    db = get_supabase()
    db.table("phone_numbers").update({"daily_send_count": 0}).neq(
        "id", ""
    ).execute()
