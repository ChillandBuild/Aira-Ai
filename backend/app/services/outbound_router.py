import logging

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)


async def get_best_number() -> dict | None:
    db = get_supabase()
    rows = (
        db.table("phone_numbers")
        .select("*")
        .eq("status", "active")
        .neq("quality_rating", "red")
        .gte("warm_up_day", 14)
        .eq("paused_outbound", False)
        .execute()
        .data
        or []
    )
    if not rows:
        logger.warning("No healthy outbound numbers available")
        return None

    def _sort_key(row: dict) -> tuple:
        # green before yellow (alphabetically, "green" < "yellow")
        quality_rank = 0 if row.get("quality_rating", "").lower() == "green" else 1
        tier = row.get("messaging_tier") or 1
        ratio = (row.get("daily_send_count") or 0) / tier
        return (quality_rank, ratio)

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
