import logging

from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)


def notify_user(
    tenant_id: str,
    user_id: str,
    type: str,
    title: str,
    message: str,
    *,
    db=None,
    dedupe_lead_id: str | None = None,
) -> None:
    """Insert a single notification for one user. Best-effort: never raises."""
    if not user_id:
        return
    db = db or get_supabase()
    try:
        if dedupe_lead_id:
            existing = (
                db.table("app_notifications")
                .select("id")
                .eq("tenant_id", tenant_id)
                .eq("user_id", user_id)
                .eq("type", type)
                .eq("is_read", False)
                .limit(50)
                .execute()
            )
            if existing.data:
                return
        db.table("app_notifications").insert({
            "tenant_id": tenant_id,
            "user_id": user_id,
            "type": type,
            "title": title,
            "message": message,
        }).execute()
    except Exception as e:
        logger.warning(f"notify_user failed (type={type} user={user_id}): {e}")


def _active_caller_user_ids(db, tenant_id: str) -> list[str]:
    callers = (
        db.table("callers")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .eq("active", True)
        .eq("status", "active")
        .execute()
    )
    return [c["user_id"] for c in (callers.data or []) if c.get("user_id")]


def _owner_user_id(db, tenant_id: str) -> str | None:
    owner = (
        db.table("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .eq("role", "owner")
        .limit(1)
        .execute()
    )
    return (owner.data[0] if owner.data else {}).get("user_id")


def notify_pool(
    tenant_id: str,
    type: str,
    title: str,
    message: str,
    *,
    db=None,
    segments: list | None = None,
    exclude_user_ids: list[str] | None = None,
) -> None:
    """Fan out one notification per active caller + owner. Best-effort: never raises.

    `segments` is accepted for future per-segment routing; the callers table has
    no segment column today, so it does not filter recipients yet.
    """
    db = db or get_supabase()
    exclude = set(exclude_user_ids or [])
    try:
        recipients = set(_active_caller_user_ids(db, tenant_id))
        owner = _owner_user_id(db, tenant_id)
        if owner:
            recipients.add(owner)
        for uid in recipients:
            if uid in exclude:
                continue
            db.table("app_notifications").insert({
                "tenant_id": tenant_id,
                "user_id": uid,
                "type": type,
                "title": title,
                "message": message,
            }).execute()
    except Exception as e:
        logger.warning(f"notify_pool failed (type={type}): {e}")
