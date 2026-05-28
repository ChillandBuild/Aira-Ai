# backend/app/services/assignment.py
import json
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
        on_conflict="tenant_id,key",
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
        .eq("status", "active")
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
        db.table("leads").update({"assigned_to": chosen_id}).eq("id", lead_id).eq("tenant_id", tenant_id).execute()
        logger.info(f"Lead {lead_id} auto-assigned to caller {chosen_id}")

    return chosen_id


def reassign_backlog(caller_id: str, tenant_id: str) -> None:
    """
    Check for any unassigned Hot leads or flagged leads and assign them
    to this caller when they come online (up to 20 total).
    """
    if not is_round_robin_enabled(tenant_id):
        return

    db = get_supabase()
    
    # 1. Fetch unassigned Hot leads
    hot_res = (
        db.table("leads")
        .select("id")
        .eq("tenant_id", tenant_id)
        .is_("assigned_to", "null")
        .eq("segment", "A")
        .limit(10)
        .execute()
    )
    
    # 2. Fetch unassigned flagged leads
    flagged_res = (
        db.table("leads")
        .select("id")
        .eq("tenant_id", tenant_id)
        .is_("assigned_to", "null")
        .eq("needs_human_intervention", True)
        .limit(10)
        .execute()
    )
    
    ids_to_assign = set()
    for row in (hot_res.data or []):
        ids_to_assign.add(row["id"])
    for row in (flagged_res.data or []):
        ids_to_assign.add(row["id"])
        
    if ids_to_assign:
        db.table("leads").update({"assigned_to": caller_id}).in_("id", list(ids_to_assign)).execute()
        logger.info(f"Reassigned {len(ids_to_assign)} backlog leads to caller {caller_id} upon coming online.")


_INBOX_CONFIG_DEFAULT: dict = {
    "enabled": False,
    "auto_assign_enabled": False,
    "segments": ["A"],
    "channels": ["whatsapp", "instagram", "facebook", "telegram"],
    "triggers": ["A", "B", "C", "E", "F"],
}

_TELECALLING_CONFIG_DEFAULT: dict = {
    "enabled": False,
    "auto_assign_enabled": False,
    "segments": ["A"],
    "channels": ["whatsapp"],
}


def get_inbox_config(tenant_id: str) -> dict:
    """Return inbox_config from app_settings, merged with defaults."""
    db = get_supabase()
    row = (
        db.table("app_settings")
        .select("value")
        .eq("tenant_id", tenant_id)
        .eq("key", "inbox_config")
        .maybe_single()
        .execute()
    )
    if row and row.data:
        try:
            stored = json.loads(row.data["value"])
            return {**_INBOX_CONFIG_DEFAULT, **stored}
        except Exception:
            pass
    return dict(_INBOX_CONFIG_DEFAULT)


def get_telecalling_config(tenant_id: str) -> dict:
    """Return telecalling_config from app_settings, merged with defaults."""
    db = get_supabase()
    row = (
        db.table("app_settings")
        .select("value")
        .eq("tenant_id", tenant_id)
        .eq("key", "telecalling_config")
        .maybe_single()
        .execute()
    )
    if row and row.data:
        try:
            stored = json.loads(row.data["value"])
            return {**_TELECALLING_CONFIG_DEFAULT, **stored}
        except Exception:
            pass
    return dict(_TELECALLING_CONFIG_DEFAULT)


def save_inbox_config(tenant_id: str, config: dict) -> None:
    """Persist inbox_config to app_settings."""
    db = get_supabase()
    db.table("app_settings").upsert(
        {
            "key": "inbox_config",
            "value": json.dumps(config),
            "tenant_id": tenant_id,
            "is_secret": False,
        },
        on_conflict="tenant_id,key",
    ).execute()


def save_telecalling_config(tenant_id: str, config: dict) -> None:
    """Persist telecalling_config to app_settings."""
    db = get_supabase()
    db.table("app_settings").upsert(
        {
            "key": "telecalling_config",
            "value": json.dumps(config),
            "tenant_id": tenant_id,
            "is_secret": False,
        },
        on_conflict="tenant_id,key",
    ).execute()


def should_escalate_to_inbox(config: dict, trigger: str, segment: str, channel: str) -> bool:
    """Return True if this event should create an inbox handover.
    Trigger C (user asked for human) bypasses all config gates — always escalates."""
    if trigger == "C":
        return True  # explicit user intent overrides all config
    if not config.get("enabled"):
        return False
    if trigger not in config.get("triggers", []):
        return False
    if segment not in config.get("segments", ["A"]):
        return False
    if channel not in config.get("channels", []):
        return False
    return True


def should_assign_to_telecalling(config: dict, segment: str, channel: str) -> bool:
    """Return True if this event should auto-assign to a telecaller."""
    if not config.get("enabled") or not config.get("auto_assign_enabled"):
        return False
    if segment not in config.get("segments", ["A"]):
        return False
    if channel not in config.get("channels", ["whatsapp"]):
        return False
    return True
