import logging
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

SPAM_PAUSE_THRESHOLD = 7  # auto-pause when spam_score reaches this


async def get_best_voice_number() -> dict | None:
    db = get_supabase()
    result = (
        db.table("voice_numbers")
        .select("*")
        .eq("status", "active")
        .order("spam_score")
        .order("pickup_rate", desc=True)
        .order("calls_today")
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


async def increment_voice_call_count(number_id: str) -> None:
    db = get_supabase()
    row = db.table("voice_numbers").select("calls_today").eq("id", number_id).maybe_single().execute()
    current = (row.data or {}).get("calls_today", 0)
    db.table("voice_numbers").update({"calls_today": current + 1}).eq("id", number_id).execute()


async def reset_voice_daily_counts() -> None:
    db = get_supabase()
    db.table("voice_numbers").update({"calls_today": 0}).neq("status", "archived").execute()


async def report_spam_flag(number_id: str) -> None:
    """
    Increment spam_score. If threshold reached, auto-pause and log.
    Call this when a Truecaller flag or high no-answer rate is detected.
    """
    db = get_supabase()
    row = db.table("voice_numbers").select("spam_score, number, status").eq("id", number_id).maybe_single().execute()
    if not row.data:
        return

    current_score = (row.data.get("spam_score") or 0) + 1
    updates: dict = {"spam_score": current_score}

    if current_score >= SPAM_PAUSE_THRESHOLD and row.data.get("status") == "active":
        updates["status"] = "paused"
        logger.warning(f"Voice number {row.data['number']} auto-paused (spam_score={current_score})")

    db.table("voice_numbers").update(updates).eq("id", number_id).execute()


async def update_pickup_rate(number_id: str, answered: bool) -> None:
    """Rolling average pickup rate — weighted 90/10 to smooth spikes."""
    db = get_supabase()
    row = db.table("voice_numbers").select("pickup_rate").eq("id", number_id).maybe_single().execute()
    if not row.data:
        return
    current = float(row.data.get("pickup_rate") or 100.0)
    new_rate = (current * 0.9) + (100.0 if answered else 0.0) * 0.1
    db.table("voice_numbers").update({"pickup_rate": round(new_rate, 2)}).eq("id", number_id).execute()
    if new_rate < 20.0:
        await report_spam_flag(number_id)
