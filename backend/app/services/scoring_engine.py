"""
AIRA Score Engine v2

Composite score = clamp(arc + intent_delta + engagement_delta, 1, 10)

  arc_score        — LLM scores the full conversation thread, fires every 3 inbound
                     messages or on a significant trigger (booking keyword, first message).
  intent_delta     — Rule-based instant signal on the current message. -3..+3.
                     Rejection phrases bypass everything → immediate score 1, segment D.
  engagement_delta — Time-decay applied by APScheduler every 6 h. -4..0.
                     Silent leads drift to C/D without needing to send another message.

Segment lock: upgrade always immediate. Small drop (1 segment) needs 2 consecutive
confirmations. Big drop (2+ segments) or rejection phrase: immediate.
"""

import logging
import re
from datetime import datetime, timezone

from groq import AsyncGroq

from app.config import settings
from app.services.segmentation import score_to_segment, parse_thresholds

logger = logging.getLogger(__name__)

_client = AsyncGroq(api_key=settings.groq_api_key) if settings.groq_api_key else None
_MODEL = "llama-3.3-70b-versatile"

# ── Intent signal patterns ────────────────────────────────────────────────────

_REJECTION_PATTERNS = [
    r"\bnot interested\b",
    r"\bstop\b",
    r"\bunsubscribe\b",
    r"\bno thanks\b",
    r"\bno thank you\b",
    r"\bwrong number\b",
    r"\bdo not contact\b",
    r"\bdon'?t contact\b",
    r"\bplease remove\b",
    r"\bopt.?out\b",
    # Tamil
    r"வேண்டாம்",
    r"நிறுத்துங்கள்",
    r"தேவையில்லை",
    r"விலகு",
    # Hindi
    r"नहीं चाहिए",
    r"रुको",
    r"बंद करो",
]

_BOOKING_PATTERNS = [
    r"\bbook\b",
    r"\bconfirm\b",
    r"\bproceed\b",
    r"\bpayment\b",
    r"\bpay\b",
    r"\bprice\b",
    r"\bcost\b",
    r"\bhow much\b",
    r"\bregister\b",
    r"\bslot\b",
    r"\bschedule\b",
    r"\bdate\b.*\bhomam\b",
    r"\bbook.*homam\b",
    # Tamil
    r"பதிவு",
    r"விலை",
    r"கட்டணம்",
    r"எப்போது",
    r"book பண்ண",
    r"confirm பண்ண",
    # Hindi
    r"बुक करना",
    r"कीमत",
    r"भुगतान",
]

_INFO_PROVIDED_PATTERNS = [
    r"\bmy name is\b",
    r"\bname\s*[:\-]",
    r"\bgotram\b",
    r"\bnakshatram\b",
    r"\brasi\b",
    r"\brashi\b",
    r"\baddress\b",
    r"\bpincode\b",
]

_ACTIVE_BOOKING_STATES = {
    "collecting_name",
    "collecting_rasi",
    "collecting_nakshatram",
    "collecting_gotram",
    "collecting_address",
    "awaiting_payment",
}

# Sentinel for rejection override
_REJECTION_SENTINEL = -99


def _compute_intent_delta(message: str, flow_state: str) -> tuple[int, str]:
    """
    Returns (delta, reason).
    delta is -3..+3 or _REJECTION_SENTINEL for immediate D override.
    """
    # Rejection check first — no LLM needed, immediate D
    for pat in _REJECTION_PATTERNS:
        if re.search(pat, message, re.IGNORECASE):
            return _REJECTION_SENTINEL, "rejection"

    # Active booking flow = strongest positive signal
    if flow_state in _ACTIVE_BOOKING_STATES:
        return 3, "active_booking_flow"

    delta = 0
    reasons: list[str] = []

    for pat in _BOOKING_PATTERNS:
        if re.search(pat, message, re.IGNORECASE):
            delta += 2
            reasons.append("booking_intent")
            break

    for pat in _INFO_PROVIDED_PATTERNS:
        if re.search(pat, message, re.IGNORECASE):
            delta += 1
            reasons.append("info_provided")
            break

    # Detailed message = thoughtful engagement
    if len(message.strip()) > 60:
        delta += 1
        reasons.append("detailed_message")

    return max(-3, min(3, delta)), ",".join(reasons) or "neutral"


def _compute_engagement_delta(last_inbound_at: datetime | None) -> int:
    """Time-decay based on days since last inbound message."""
    if last_inbound_at is None:
        return 0
    now = datetime.now(timezone.utc)
    if last_inbound_at.tzinfo is None:
        last_inbound_at = last_inbound_at.replace(tzinfo=timezone.utc)
    days = (now - last_inbound_at).days
    if days <= 1:
        return 0
    elif days <= 3:
        return -1
    elif days <= 7:
        return -2
    elif days <= 30:
        return -3
    else:
        return -4


_ARC_RUBRIC_DEFAULT = """
9-10: High intent — explicitly asked for pricing/booking/payment, completed booking steps, confirmed participation
7-8:  Warm — asking detailed questions, comparing options, providing requested info, multiple engaged follow-ups
5-6:  Neutral — general inquiry, first contact, short acknowledgments with some context
3-4:  Lukewarm — vague replies, no follow-up to questions, low engagement
1-2:  Low intent — unresponsive, dismissive, irrelevant, or repeated single-word replies with no context
"""


async def _score_arc(conversation: str, tenant_id: str | None) -> int:
    """LLM scores the FULL conversation thread for overall purchase intent."""
    if not _client:
        return 5
    try:
        from app.config_dynamic import get_setting
        custom = get_setting("scoring_rubric", tenant_id=tenant_id) if tenant_id else None
        rubric = (custom or _ARC_RUBRIC_DEFAULT).strip()
    except Exception:
        rubric = _ARC_RUBRIC_DEFAULT.strip()

    prompt = (
        f"You score sales conversations for purchase intent (1-10).\n\n"
        f"Rubric:\n{rubric}\n\n"
        f"Conversation:\n{conversation}\n\n"
        f"Score the OVERALL purchase intent trajectory of this conversation. "
        f"Consider the full arc — not just the last message. "
        f"Reply with ONLY a single integer 1-10."
    )
    try:
        resp = await _client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=4,
        )
        return max(1, min(10, int(resp.choices[0].message.content.strip())))
    except Exception as e:
        logger.error(f"Arc scoring failed: {e}")
        return 5


def _should_score_arc(arc_message_count: int, intent_reason: str) -> bool:
    """True if this message should trigger an arc (LLM) re-score."""
    if arc_message_count <= 1:
        return True  # first message always scores arc
    if arc_message_count % 3 == 0:
        return True  # every 3rd message
    if "booking_intent" in intent_reason or "active_booking_flow" in intent_reason:
        return True  # significant positive signal
    return False


def _apply_segment_lock(
    proposed: str,
    current: str,
    drop_count: int,
    big_drop: bool,
) -> tuple[str, int]:
    """
    Returns (final_segment, new_drop_count).

    Upgrade:            always immediate, resets counter.
    Small drop (1 seg): needs 2 consecutive proposed drops.
    Big drop (2+ segs)  or rejection: immediate, resets counter.
    """
    order = {"A": 4, "B": 3, "C": 2, "D": 1}
    diff = order.get(current, 2) - order.get(proposed, 2)

    if diff <= 0:
        # Upgrade or same level
        return proposed, 0

    if big_drop or diff >= 2:
        # Rejection or multi-segment drop: immediate
        return proposed, 0

    # Small drop: need 2 consecutive
    new_count = drop_count + 1
    if new_count >= 2:
        return proposed, 0
    return current, new_count


async def compute_score(
    message: str,
    lead_id: str,
    db,
    tenant_id: str | None = None,
) -> dict:
    """
    Main entry point. Computes composite score, persists to DB, returns breakdown.

    Returns:
        score            — final composite score (1-10), written to leads.score
        segment          — final segment (A/B/C/D), written to leads.segment
        arc_score        — last LLM arc score
        intent_delta     — rule-based delta (-3..+3)
        engagement_delta — time-decay delta (-4..0)
        intent_reason    — human-readable reason string
        arc_updated      — whether LLM was called this message
        segment_drop_count — updated consecutive-drop counter
    """
    # ── 1. Load current lead state ─────────────────────────────────────────
    lead_row = (
        db.table("leads")
        .select(
            "score,score_arc,score_intent_delta,score_engagement_delta,"
            "arc_message_count,segment,segment_drop_count,last_inbound_at"
        )
        .eq("id", str(lead_id))
        .maybe_single()
        .execute()
    )
    data = lead_row.data or {}

    current_arc = data.get("score_arc") or 5
    current_segment = data.get("segment") or "C"
    drop_count = data.get("segment_drop_count") or 0
    arc_msg_count = (data.get("arc_message_count") or 0) + 1

    raw_last_inbound = data.get("last_inbound_at")
    last_inbound_at: datetime | None = None
    if raw_last_inbound:
        try:
            last_inbound_at = datetime.fromisoformat(
                raw_last_inbound.replace("Z", "+00:00")
            )
        except Exception:
            pass

    # ── 2. Flow state (for intent delta) ──────────────────────────────────
    try:
        state_row = (
            db.table("lead_conversation_state")
            .select("state")
            .eq("lead_id", str(lead_id))
            .maybe_single()
            .execute()
        )
        flow_state = (state_row.data or {}).get("state") or "idle"
    except Exception:
        flow_state = "idle"

    # ── 3. Signal 2: Intent delta (instant, rule-based) ───────────────────
    intent_delta, intent_reason = _compute_intent_delta(message, flow_state)
    is_rejection = intent_delta == _REJECTION_SENTINEL

    now_iso = datetime.now(timezone.utc).isoformat()

    if is_rejection:
        db.table("leads").update({
            "score": 1,
            "score_arc": 1,
            "score_intent_delta": -3,
            "score_engagement_delta": 0,
            "segment": "D",
            "segment_drop_count": 0,
            "arc_message_count": 0,
            "last_inbound_at": now_iso,
        }).eq("id", str(lead_id)).execute()
        logger.info(f"Lead {lead_id} rejection detected — immediate D")
        return {
            "score": 1,
            "segment": "D",
            "arc_score": 1,
            "intent_delta": -3,
            "engagement_delta": 0,
            "intent_reason": "rejection",
            "arc_updated": True,
            "segment_drop_count": 0,
        }

    # ── 4. Signal 3: Engagement delta (time-decay) ────────────────────────
    engagement_delta = _compute_engagement_delta(last_inbound_at)

    # ── 5. Signal 1: Arc score (LLM, conditional) ─────────────────────────
    arc_updated = False
    if _should_score_arc(arc_msg_count, intent_reason):
        try:
            msgs = (
                db.table("messages")
                .select("direction,content,created_at")
                .eq("lead_id", str(lead_id))
                .order("created_at", desc=True)
                .limit(10)
                .execute()
                .data or []
            )
            lines = []
            for m in reversed(msgs):
                role = "Bot" if m.get("direction") == "outbound" else "User"
                content = (m.get("content") or "").strip()[:200]
                if content:
                    lines.append(f"{role}: {content}")
            # Ensure current message is included even before DB write
            conversation = "\n".join(lines) if lines else f"User: {message}"
        except Exception:
            conversation = f"User: {message}"

        current_arc = await _score_arc(conversation, tenant_id)
        arc_updated = True
        arc_msg_count = 0  # reset counter after arc call

    # ── 6. Composite final score ───────────────────────────────────────────
    final_score = max(1, min(10, current_arc + intent_delta + engagement_delta))

    # ── 7. Segment with lock ───────────────────────────────────────────────
    try:
        from app.config_dynamic import get_setting as _gs
        thresholds = parse_thresholds(_gs("scoring_segment_thresholds", tenant_id=tenant_id))
    except Exception:
        thresholds = None

    proposed_segment = score_to_segment(final_score, thresholds=thresholds)
    final_segment, new_drop_count = _apply_segment_lock(
        proposed_segment, current_segment, drop_count, big_drop=False
    )

    # ── 8. Persist ─────────────────────────────────────────────────────────
    db.table("leads").update({
        "score": final_score,
        "score_arc": current_arc,
        "score_intent_delta": intent_delta,
        "score_engagement_delta": engagement_delta,
        "arc_message_count": arc_msg_count,
        "segment": final_segment,
        "segment_drop_count": new_drop_count,
        "last_inbound_at": now_iso,
    }).eq("id", str(lead_id)).execute()

    logger.info(
        f"Lead {lead_id} scored: arc={current_arc} intent={intent_delta:+d} "
        f"eng={engagement_delta:+d} → {final_score} ({final_segment}) "
        f"[arc_updated={arc_updated}, reason={intent_reason}]"
    )

    return {
        "score": final_score,
        "segment": final_segment,
        "arc_score": current_arc,
        "intent_delta": intent_delta,
        "engagement_delta": engagement_delta,
        "intent_reason": intent_reason,
        "arc_updated": arc_updated,
        "segment_drop_count": new_drop_count,
    }


async def apply_engagement_decay_all(db, tenant_id: str | None = None) -> int:
    """
    Scheduler job: recompute engagement delta and score for all leads
    that have been silent for >24 hours. Returns count of leads updated.

    Called by APScheduler every 6 hours.
    """
    from datetime import timedelta
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()

    query = (
        db.table("leads")
        .select("id,score_arc,score_intent_delta,score_engagement_delta,segment,segment_drop_count,last_inbound_at,tenant_id")
        .lt("last_inbound_at", cutoff)
        .is_("deleted_at", "null")
    )
    if tenant_id:
        query = query.eq("tenant_id", tenant_id)

    leads = (query.execute().data or [])
    updated = 0

    for lead in leads:
        try:
            raw = lead.get("last_inbound_at")
            last_inbound: datetime | None = None
            if raw:
                last_inbound = datetime.fromisoformat(raw.replace("Z", "+00:00"))

            new_eng_delta = _compute_engagement_delta(last_inbound)
            old_eng_delta = lead.get("score_engagement_delta") or 0

            if new_eng_delta == old_eng_delta:
                continue  # nothing changed

            arc = lead.get("score_arc") or 5
            intent = lead.get("score_intent_delta") or 0
            final_score = max(1, min(10, arc + intent + new_eng_delta))

            lead_tenant = lead.get("tenant_id")
            try:
                from app.config_dynamic import get_setting as _gs
                thresholds = parse_thresholds(_gs("scoring_segment_thresholds", tenant_id=lead_tenant))
            except Exception:
                thresholds = None

            proposed_segment = score_to_segment(final_score, thresholds=thresholds)
            current_segment = lead.get("segment") or "C"
            drop_count = lead.get("segment_drop_count") or 0
            final_segment, new_drop_count = _apply_segment_lock(
                proposed_segment, current_segment, drop_count, big_drop=False
            )

            db.table("leads").update({
                "score": final_score,
                "score_engagement_delta": new_eng_delta,
                "segment": final_segment,
                "segment_drop_count": new_drop_count,
            }).eq("id", lead["id"]).execute()
            updated += 1
        except Exception as e:
            logger.error(f"Engagement decay failed for lead {lead.get('id')}: {e}")

    logger.info(f"Engagement decay applied to {updated} leads")
    return updated
