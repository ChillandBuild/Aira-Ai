"""Per-broadcast delivery attribution.

When the same lead receives multiple broadcasts close together (e.g. 1-2 min
apart), a single time window can contain several outbound messages for that
lead. Picking by highest delivery_status priority lets an adjacent broadcast's
"sent" mask THIS broadcast's "failed"; picking "any failed in window" over-
attributes a failure to neighbouring broadcasts. Both are wrong.

The correct read-path heuristic (until broadcast_recipients stores meta_message_id
for an exact join) is the outbound message NEAREST IN TIME to this broadcast's
send. This is the single source of truth shared by the broadcast classifier,
the tag stats, and the segment CSV so they can never disagree.
"""
from datetime import datetime, timedelta

DELIVERY_PRIORITY = {"failed": 0, "sent": 1, "delivered": 2, "read": 3}

_WINDOW_BEFORE = timedelta(minutes=2)
_WINDOW_AFTER = timedelta(minutes=10)


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def nearest_record(
    records: list[tuple], anchor: datetime | None
) -> tuple | None:
    """Return the record whose timestamp is nearest to `anchor` within the send
    window, or None. Each record is a tuple with a datetime at index 0
    (``(ts, status, *extra)``). On an exact distance tie the lower-priority
    (more severe) delivery_status wins so a failure is never hidden by a
    same-distance "sent".
    """
    if not records or anchor is None:
        return None
    window_start = anchor - _WINDOW_BEFORE
    window_end = anchor + _WINDOW_AFTER
    best: tuple | None = None
    best_dist: float | None = None
    for rec in records:
        ts = rec[0]
        if ts is None or not (window_start <= ts <= window_end):
            continue
        dist = abs((ts - anchor).total_seconds())
        status = rec[1] if len(rec) > 1 else None
        if (
            best_dist is None
            or dist < best_dist
            or (
                dist == best_dist
                and DELIVERY_PRIORITY.get(status, 9) < DELIVERY_PRIORITY.get(best[1] if len(best) > 1 else None, 9)
            )
        ):
            best = rec
            best_dist = dist
    return best


def nearest_status(records: list[tuple], anchor: datetime | None) -> str | None:
    """Delivery status of the message nearest the broadcast send, or None."""
    rec = nearest_record(records, anchor)
    return rec[1] if rec and len(rec) > 1 else None
