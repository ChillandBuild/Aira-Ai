# backend/app/services/assignment.py
import logging
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)


def is_round_robin_enabled(tenant_id: str) -> bool:
    """Check app_settings for round_robin_enabled flag. Defaults to True."""
    db = get_supabase()
    result = (
        db.table("app_settings")
        .select("value")
        .eq("tenant_id", tenant_id)
        .eq("key", "round_robin_enabled")
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        return True  # default: on
    return result.data.get("value", "true").lower() != "false"


def set_round_robin_enabled(tenant_id: str, enabled: bool) -> None:
    """Upsert the round_robin_enabled flag in app_settings."""
    db = get_supabase()
    db.table("app_settings").upsert(
        {
            "key": "round_robin_enabled",
            "value": "true" if enabled else "false",
            "tenant_id": tenant_id,
            "is_secret": False,
        },
        on_conflict="key",
    ).execute()


def get_caller_id_for_user(user_id: str, tenant_id: str) -> str | None:
    """Return callers.id for this auth user, or None if not a caller."""
    db = get_supabase()
    result = (
        db.table("callers")
        .select("id")
        .eq("user_id", user_id)
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .maybe_single()
        .execute()
    )
    if result is None:
        return None
    return (result.data or {}).get("id")


def auto_assign_lead(lead_id: str, tenant_id: str) -> str | None:
    """
    Assign lead to the active caller with fewest assigned non-disqualified leads.
    Returns the assigned caller's id, or None if round-robin is off or no active callers.
    """
    if not is_round_robin_enabled(tenant_id):
        logger.info("Round-robin is OFF for tenant %s — skipping auto-assign", tenant_id)
        return None

    db = get_supabase()
    callers = (
        db.table("callers")
        .select("id")
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .execute()
    )
    if not callers.data:
        return None

    min_count = None
    chosen_id = None
    for caller in callers.data:
        count_res = (
            db.table("leads")
            .select("id", count="exact")
            .eq("tenant_id", tenant_id)
            .eq("assigned_to", caller["id"])
            .neq("segment", "D")
            .execute()
        )
        count = count_res.count or 0
        if min_count is None or count < min_count:
            min_count = count
            chosen_id = caller["id"]

    if chosen_id:
        db.table("leads").update({"assigned_to": chosen_id}).eq("id", lead_id).execute()
        logger.info(f"Lead {lead_id} auto-assigned to caller {chosen_id}")

    return chosen_id
