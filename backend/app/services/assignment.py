# backend/app/services/assignment.py
import json
import logging
from datetime import datetime, timezone
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)


def is_round_robin_enabled(tenant_id: str) -> bool:
    """Whether auto-assign to telecallers is on.

    Single source of truth: telecalling_config.enabled. The legacy
    round_robin_enabled toggle and the Settings panel now drive the same flag,
    so the two UIs can never contradict each other.
    """
    return bool(get_telecalling_config(tenant_id).get("enabled"))


def set_round_robin_enabled(tenant_id: str, enabled: bool) -> None:
    """Flip the single auto-assign switch (telecalling_config.enabled)."""
    cfg = get_telecalling_config(tenant_id)
    cfg["enabled"] = bool(enabled)
    save_telecalling_config(tenant_id, cfg)



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


def _open_lead_count(db, tenant_id: str, caller_id: str) -> int:
    """Active workload for a caller = assigned leads that are still open.

    Excludes Disqualified (D) and Converted leads so a closer is never punished
    for closing and a disqualified pile never blocks fresh work.
    """
    res = (
        db.table("leads")
        .select("id", count="exact")
        .eq("tenant_id", tenant_id)
        .eq("assigned_to", caller_id)
        .neq("segment", "D")
        .is_("converted_at", "null")
        .execute()
    )
    return res.count or 0


def record_assignment_event(
    lead_id: str,
    *,
    tenant_id: str,
    segment: str | None,
    caller_id: str,
    caller_name: str | None,
    reason: str,
    method: str,
    score: int | None = None,
    matched_segments: list | None = None,
    event_type: str = "assigned",
    prev_caller_id: str | None = None,
    prev_caller_name: str | None = None,
    db=None,
) -> None:
    """Write the proof event powering the Assignment Log. Never raises."""
    db = db or get_supabase()
    try:
        db.table("lead_stage_events").insert({
            "lead_id": str(lead_id),
            "to_segment": segment if segment in ("A", "B", "C", "D") else "C",
            "event_type": event_type,
            "tenant_id": tenant_id,
            "metadata": {
                "caller_id": str(caller_id),
                "caller_name": caller_name,
                "reason": reason,
                "method": method,
                "score": score,
                "matched_segments": matched_segments or [],
                "prev_caller_id": str(prev_caller_id) if prev_caller_id else None,
                "prev_caller_name": prev_caller_name,
            },
        }).execute()
    except Exception as e:
        logger.warning(f"record_assignment_event failed for lead {lead_id}: {e}")


def auto_assign_lead(
    lead_id: str,
    tenant_id: str,
    *,
    reason: str = "round_robin",
    segment: str | None = None,
    score: int | None = None,
    matched_segments: list | None = None,
    method: str = "round-robin",
    event_type: str = "assigned",
    prev_caller_id: str | None = None,
    prev_caller_name: str | None = None,
) -> str | None:
    """
    Assign lead to the active caller with the fewest OPEN leads (least-loaded
    round-robin). Records an assignment audit event. Returns the caller id, or
    None if auto-assign is off or there are no active callers.
    """
    if not is_round_robin_enabled(tenant_id):
        logger.info("Auto-assign is OFF for tenant %s — skipping", tenant_id)
        return None

    db = get_supabase()

    # Exclude the owner's caller record — matches list_callers exclusion logic
    owner = (
        db.table("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .eq("role", "owner")
        .limit(1)
        .execute()
    )
    owner_user_id = (owner.data[0] if owner.data else {}).get("user_id")

    query = (
        db.table("callers")
        .select("id,name")
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .eq("status", "active")
    )
    if owner_user_id:
        query = query.neq("user_id", owner_user_id)
    callers = query.execute()
    if not callers.data:
        return None

    min_count = None
    chosen = None
    for caller in callers.data:
        count = _open_lead_count(db, tenant_id, caller["id"])
        if min_count is None or count < min_count:
            min_count = count
            chosen = caller

    if not chosen:
        return None

    chosen_id = chosen["id"]
    db.table("leads").update({
        "assigned_to": chosen_id,
        "assigned_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", lead_id).eq("tenant_id", tenant_id).execute()
    logger.info(f"Lead {lead_id} auto-assigned to caller {chosen_id} (reason={reason})")

    record_assignment_event(
        lead_id,
        tenant_id=tenant_id,
        segment=segment,
        caller_id=chosen_id,
        caller_name=chosen.get("name"),
        reason=reason,
        method=method,
        score=score,
        matched_segments=matched_segments,
        event_type=event_type,
        prev_caller_id=prev_caller_id,
        prev_caller_name=prev_caller_name,
        db=db,
    )
    return chosen_id


def maybe_assign_lead(
    lead_id: str,
    tenant_id: str,
    segment: str | None,
    channel: str | None = "whatsapp",
    *,
    reason: str = "segment_match",
    score: int | None = None,
) -> str | None:
    """Single gated entry point for auto-assignment.

    Assigns iff the lead's CURRENT segment qualifies under the tenant's
    telecalling_config. State-based: callable on creation, on transition, or
    from the sweep — it only ever acts on the lead's present state.

    channel=None means the promotion is not tied to a messaging channel
    (call outcome, CSV, manual mark): the channel gate is skipped while the
    enabled + segment gates still apply.
    """
    cfg = get_telecalling_config(tenant_id)
    if not cfg.get("enabled"):
        return None
    if (segment or "") not in cfg.get("segments", ["A"]):
        return None
    if channel is not None and channel not in cfg.get("channels", ["whatsapp"]):
        return None
    return auto_assign_lead(
        lead_id,
        tenant_id,
        reason=reason,
        segment=segment,
        score=score,
        matched_segments=cfg.get("segments"),
    )


def sweep_unassigned_leads(limit_per_tenant: int = 200) -> int:
    """State-based safety net for auto-assignment.

    Assigns any UNASSIGNED lead whose CURRENT segment qualifies under its
    tenant's telecalling_config. This is what guarantees no qualifying lead is
    ever stranded — it catches bulk CSV/broadcast imports and leads that
    qualified before the config was changed, regardless of how they got there.
    Returns the number of leads assigned this pass.
    """
    db = get_supabase()
    rows = (
        db.table("app_settings")
        .select("tenant_id,value")
        .eq("key", "telecalling_config")
        .execute()
    )
    total = 0
    for row in (rows.data or []):
        tenant_id = row.get("tenant_id")
        try:
            cfg = {**_TELECALLING_CONFIG_DEFAULT, **json.loads(row.get("value") or "{}")}
        except Exception:
            continue
        if not tenant_id or not cfg.get("enabled"):
            continue
        segments = cfg.get("segments") or []
        if not segments:
            continue
        leads = (
            db.table("leads")
            .select("id,segment")
            .eq("tenant_id", tenant_id)
            .is_("assigned_to", "null")
            .is_("converted_at", "null")
            .is_("deleted_at", "null")
            .in_("segment", segments)
            .limit(limit_per_tenant)
            .execute()
        )
        for lead in (leads.data or []):
            try:
                if auto_assign_lead(
                    lead["id"], tenant_id,
                    reason="sweep", method="sweep",
                    segment=lead.get("segment"), matched_segments=segments,
                ):
                    total += 1
                else:
                    # No active caller available — stop hammering this tenant;
                    # the next sweep retries once a caller is active.
                    break
            except Exception as e:
                logger.warning(f"sweep assign failed for lead {lead['id']}: {e}")
    if total:
        logger.info(f"Assignment sweep: assigned {total} unassigned qualifying lead(s)")
    return total


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
        .select("id,segment")
        .eq("tenant_id", tenant_id)
        .is_("assigned_to", "null")
        .eq("segment", "A")
        .limit(10)
        .execute()
    )

    # 2. Fetch unassigned flagged leads
    flagged_res = (
        db.table("leads")
        .select("id,segment")
        .eq("tenant_id", tenant_id)
        .is_("assigned_to", "null")
        .eq("needs_human_intervention", True)
        .limit(10)
        .execute()
    )

    seg_by_id: dict = {}
    for row in (hot_res.data or []):
        seg_by_id[row["id"]] = row.get("segment")
    for row in (flagged_res.data or []):
        seg_by_id[row["id"]] = row.get("segment")

    if seg_by_id:
        ids_to_assign = list(seg_by_id.keys())
        db.table("leads").update({
            "assigned_to": caller_id,
            "assigned_at": datetime.now(timezone.utc).isoformat(),
        }).in_("id", ids_to_assign).execute()
        cn = db.table("callers").select("name").eq("id", caller_id).eq("tenant_id", tenant_id).maybe_single().execute()
        caller_name = (cn.data or {}).get("name") if cn else None
        for lead_id, seg in seg_by_id.items():
            record_assignment_event(
                lead_id, tenant_id=tenant_id, segment=seg,
                caller_id=caller_id, caller_name=caller_name,
                reason="backlog_claim", method="login", db=db,
            )
        logger.info(f"Reassigned {len(ids_to_assign)} backlog leads to caller {caller_id} upon coming online.")


_INBOX_CONFIG_DEFAULT: dict = {
    "enabled": False,
    "auto_assign_enabled": False,
    "segments": ["A"],
    "channels": ["whatsapp", "instagram", "facebook", "telegram"],
    "triggers": ["A", "B", "C", "F"],
}

_TELECALLING_CONFIG_DEFAULT: dict = {
    "enabled": False,
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


def should_escalate_to_inbox(config: dict, trigger: str, channel: str) -> bool:
    """Return True if this trigger should create an inbox handover.
    Trigger C always escalates (explicit user request, bypasses all gates).
    Other triggers check master switch, trigger list, and channel — no segment gate."""
    if trigger == "C":
        return True
    if not config.get("enabled"):
        return False
    if trigger not in config.get("triggers", []):
        return False
    if channel not in config.get("channels", []):
        return False
    return True


def should_escalate_hot_lead(config: dict, segment: str, channel: str) -> bool:
    """Segment-driven hot lead escalation. Used by score ≥ 7 events
    in both AI and bot paths. Single gate: master + segment + channel."""
    if not config.get("enabled"):
        return False
    if segment not in config.get("segments", []):
        return False
    if channel not in config.get("channels", []):
        return False
    return True


def should_assign_to_telecalling(config: dict, segment: str, channel: str) -> bool:
    """Return True if this event should auto-assign to a telecaller."""
    if not config.get("enabled"):
        return False
    if segment not in config.get("segments", ["A"]):
        return False
    if channel not in config.get("channels", ["whatsapp"]):
        return False
    return True
