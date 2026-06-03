import logging
import re
import time
import httpx
from groq import AsyncGroq
from app.config import settings
from app.db.supabase import get_supabase
from app.services.growth import record_stage_event, sync_follow_up_jobs
from app.services.segmentation import score_to_segment, parse_thresholds
from app.services.knowledge_service import get_knowledge_context
from app.services.assignment import (
    auto_assign_lead,
    get_inbox_config,
    get_telecalling_config,
    should_escalate_to_inbox,
    should_assign_to_telecalling,
)

logger = logging.getLogger(__name__)

_groq_client = AsyncGroq(api_key=settings.groq_api_key) if settings.groq_api_key else None
_REPLY_MODEL = "llama-3.3-70b-versatile"


async def _groq_complete(prompt: str, max_tokens: int = 300) -> str:
    if not _groq_client:
        raise RuntimeError("GROQ_API_KEY not configured")
    response = await _groq_client.chat.completions.create(
        model=_REPLY_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content.strip()


async def _groq_chat(messages: list[dict], max_tokens: int = 300) -> str:
    if not _groq_client:
        raise RuntimeError("GROQ_API_KEY not configured")
    response = await _groq_client.chat.completions.create(
        model=_REPLY_MODEL,
        messages=messages,
        temperature=0.4,
        max_tokens=max_tokens,
    )
    return response.choices[0].message.content.strip()


def _fetch_conversation_summary(db, lead_id: str) -> str | None:
    """Fetch the compacted conversation_summary from lead_conversation_state.
    Returns None if no summary exists or on error."""
    try:
        row = (
            db.table("lead_conversation_state")
            .select("conversation_summary")
            .eq("lead_id", str(lead_id))
            .limit(1)
            .execute()
        )
        if row and row.data:
            summary = (row.data[0].get("conversation_summary") or "").strip()
            return summary or None
    except Exception as e:
        logger.warning(f"Conversation summary fetch failed for lead {lead_id}: {e}")
    return None

FALLBACK_PROMPT = """You are a helpful AI assistant. Answer customer queries warmly and accurately.
Keep replies concise (2-3 sentences max).
Always guide the customer toward the next step: booking, payment, or speaking with our team.
If you don't know a specific detail, say: "Let me connect you with our team who can help you right away."

When a customer expresses booking intent (says "Book", "register", "I want to book"):
1. Ask for their full name
2. Ask for their Rasi (zodiac sign — e.g. Mesham, Rishabam, Mithunam)
3. Ask for their Nakshatram (birth star — e.g. Ashwini, Bharani, Karthigai)
4. Ask for their Gotram (lineage — if unknown, "Not known" is fine)
5. Ask for full delivery address (street, city, state, PIN code)
If the customer asks to speak in a regional language, switch to that language and re-ask the current question in that language.
When all 5 fields are confirmed, reply ONLY: [COLLECT_DONE] {"devotee_name": "...", "rasi": "...", "nakshatram": "...", "gotram": "...", "delivery_address": "..."}
"""
# NOTE: Tenants with a custom system prompt stored in ai_prompts (configurable via AI Tune)
# will never see FALLBACK_PROMPT. Those tenants must add the [COLLECT_DONE] collection
# instructions directly to their whatsapp_reply prompt in the AI Tune settings page.

REENGAGEMENT_FALLBACKS = {
    "1d": "Hi! Just checking in — happy to help if you still have questions. Reply here and I can point you in the right direction today.",
    "1w": "Hi! Following up in case you’re still exploring your options. If you’d like a quick update or want to take the next step, just reply and I’ll help.",
    "1m": "Hi! One last check-in in case we can still be of help. If you’d like to pick things up where we left off, just send us a message.",
}

_prompt_cache: dict[str, tuple[float, str]] = {}
_PROMPT_TTL = 60.0


def _get_prompt(name: str, tenant_id: str | None = None) -> str:
    cache_key = f"{tenant_id}:{name}" if tenant_id else name
    cached = _prompt_cache.get(cache_key)
    now = time.monotonic()
    if cached and now - cached[0] < _PROMPT_TTL:
        return cached[1]
    try:
        db = get_supabase()
        query = db.table("ai_prompts").select("content").eq("name", name)
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        row = query.limit(1).execute()
        content = (row.data[0].get("content") if row.data else None) or FALLBACK_PROMPT
    except Exception as e:
        logger.error(f"Failed to load prompt {name}: {e}")
        content = FALLBACK_PROMPT
    _prompt_cache[cache_key] = (now, content)
    return content


def invalidate_prompt_cache(name: str | None = None) -> None:
    if name:
        keys_to_remove = [k for k in _prompt_cache if k == name or k.endswith(f":{name}")]
        for k in keys_to_remove:
            _prompt_cache.pop(k, None)
    else:
        _prompt_cache.clear()


def _recent_thread(db, lead_id: str, limit: int = 6) -> list[dict]:
    return (
        db.table("messages")
        .select("direction,content,created_at")
        .eq("lead_id", str(lead_id))
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )

_FAQ_MIN_KEYWORD_LEN = 3  # ignore "no", "ok", "hi" etc. at match time

_LANG_NAMES = {"ta": "Tamil", "hi": "Hindi", "te": "Telugu", "kn": "Kannada", "ml": "Malayalam", "en": "English"}

_FALLBACK_BY_LANG = {
    "ta": "நன்றி! உங்கள் விசாரணைக்கு விரைவில் பதிலளிப்போம்.",
    "hi": "धन्यवाद! हम जल्द ही आपसे संपर्क करेंगे।",
    "te": "ధన్యవాదాలు! మేము త్వరలో మీకు తిరిగి వస్తాము.",
    "kn": "ಧನ್ಯವಾದಗಳು! ನಾವು ಶೀಘ್ರದಲ್ಲೇ ನಿಮ್ಮನ್ನು ಸಂಪರ್ಕಿಸುತ್ತೇವೆ.",
    "ml": "നന്ദി! ഞങ്ങൾ ഉടൻ തന്നെ നിങ്ങളുമായി ബന്ധപ്പെടും.",
    "en": "Thank you for reaching out! We'll get back to you shortly.",
}


def _detect_lang(text: str) -> str:
    """Return dominant language code based on Unicode block frequency."""
    if not text:
        return "en"
    counts: dict[str, int] = {}
    for ch in text:
        cp = ord(ch)
        if 0x0B80 <= cp <= 0x0BFF:
            counts["ta"] = counts.get("ta", 0) + 1
        elif 0x0C00 <= cp <= 0x0C7F:
            counts["te"] = counts.get("te", 0) + 1
        elif 0x0C80 <= cp <= 0x0CFF:
            counts["kn"] = counts.get("kn", 0) + 1
        elif 0x0D00 <= cp <= 0x0D7F:
            counts["ml"] = counts.get("ml", 0) + 1
        elif 0x0900 <= cp <= 0x097F:
            counts["hi"] = counts.get("hi", 0) + 1
        elif ch.isalpha() and cp < 128:
            counts["en"] = counts.get("en", 0) + 1
    return max(counts, key=counts.__getitem__) if counts else "en"


def _check_faq(message: str, db, tenant_id: str | None = None) -> str | None:
    """Pick the best-matching active FAQ for an inbound message.

    Scoring (lexicographic — earlier signal dominates):
      1. Distinct keywords matched with word boundary (\\bkeyword\\b)
      2. Total length of matched keywords (longer phrase = more specific)
      3. hit_count (battle-tested FAQs win ties)

    Word-boundary matching prevents 'app' hitting 'happens', 'book' hitting
    'facebook', etc. Returns the chosen FAQ's answer, or None if nothing matched.
    """
    try:
        message_lower = (message or "").lower()
        if not message_lower:
            return None

        query = db.table("faqs").select("id,answer,keywords,hit_count,question").eq("active", True)
        if tenant_id:
            query = query.eq("tenant_id", tenant_id)
        faqs = (query.execute().data or [])
        # Stable iteration order so true ties always resolve to the same FAQ
        faqs.sort(key=lambda f: str(f.get("id") or ""))

        best_faq: dict | None = None
        best_score: tuple[int, int, int] = (0, 0, -1)

        for faq in faqs:
            keywords = faq.get("keywords") or []
            matched: set[str] = set()
            for kw in keywords:
                if not kw:
                    continue
                kw_lower = kw.lower().strip()
                if len(kw_lower) < _FAQ_MIN_KEYWORD_LEN:
                    continue
                try:
                    if re.search(rf"\b{re.escape(kw_lower)}\b", message_lower):
                        matched.add(kw_lower)
                except re.error:
                    # Malformed keyword — fall back to safe substring check
                    if kw_lower in message_lower:
                        matched.add(kw_lower)

            if not matched:
                continue

            score = (
                len(matched),
                sum(len(k) for k in matched),
                faq.get("hit_count", 0) or 0,
            )
            if score > best_score:
                best_score = score
                best_faq = faq

        if not best_faq:
            return None

        logger.info(
            "FAQ matched id=%s q=%r score=(kw=%d chars=%d hits=%d)",
            best_faq.get("id"),
            best_faq.get("question"),
            best_score[0],
            best_score[1],
            best_score[2],
        )
        try:
            db.table("faqs").update(
                {"hit_count": (best_faq.get("hit_count", 0) or 0) + 1}
            ).eq("id", best_faq["id"]).execute()
        except Exception as e:
            logger.warning(f"FAQ hit_count update failed: {e}")
        return best_faq["answer"]

    except Exception as e:
        logger.error(f"FAQ check failed: {e}")
    return None

_LAST_SEND_ERROR: str | None = None


def get_last_send_error() -> str | None:
    return _LAST_SEND_ERROR


async def send_whatsapp(to_phone: str, message: str, tenant_id: str | None = None) -> str | None:
    """Send a WhatsApp message via Meta Cloud API. Returns message ID or None on failure."""
    global _LAST_SEND_ERROR
    try:
        from app.services.meta_cloud import send_text_message
        data = await send_text_message(to_number=to_phone, text=message, tenant_id=tenant_id)
        mid = (data.get("messages") or [{}])[0].get("id")
        logger.info(f"Meta sent to {to_phone}: id={mid}")
        _LAST_SEND_ERROR = None
        return mid
    except Exception as e:
        err_msg = str(e)
        # Surface Meta's actual error body so the UI can show it
        from fastapi import HTTPException as _HTTP
        if isinstance(e, _HTTP):
            err_msg = str(e.detail)[:500]
        _LAST_SEND_ERROR = err_msg
        logger.error(f"Meta send failed to {to_phone}: {err_msg}")
        return None

async def send_instagram(ig_user_id: str, message: str, tenant_id: str | None = None) -> str | None:
    """Send an Instagram DM via Facebook Graph API (Messenger Platform for Instagram).
    Uses Page Access Token — requires pages_messaging + instagram_manage_messages scope.
    """
    from app.config_dynamic import get_setting
    access_token = get_setting("instagram_access_token", tenant_id=tenant_id) or settings.meta_page_token
    if not access_token:
        logger.error(f"instagram_access_token not configured for tenant {tenant_id} — cannot send Instagram DM")
        return None
    try:
        url = "https://graph.facebook.com/v21.0/me/messages"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                params={"access_token": access_token},
                json={
                    "recipient": {"id": ig_user_id},
                    "message": {"text": message},
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
            mid = data.get("message_id")
            logger.info(f"Instagram sent to {ig_user_id}: mid={mid}")
            return mid
    except httpx.HTTPStatusError as e:
        logger.error(f"Instagram send failed to {ig_user_id}: {e.response.status_code} {e.response.text}")
        return None
    except Exception as e:
        logger.error(f"Instagram send failed to {ig_user_id}: {e}")
        return None


async def send_telegram(tg_user_id: str, message: str, tenant_id: str | None = None) -> str | None:
    """Send a Telegram message via Bot API. Returns message ID (as string) or None on failure."""
    from app.config_dynamic import get_setting
    bot_token = get_setting("telegram_bot_token", tenant_id=tenant_id) or settings.telegram_bot_token
    if not bot_token:
        logger.error(f"telegram_bot_token not configured for tenant {tenant_id} — cannot send Telegram DM")
        return None
    try:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                json={
                    "chat_id": tg_user_id,
                    "text": message,
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
            mid = str(data.get("result", {}).get("message_id"))
            logger.info(f"Telegram sent to {tg_user_id}: mid={mid}")
            return mid
    except Exception as e:
        logger.error(f"Telegram send failed to {tg_user_id}: {e}")
        return None


async def send_facebook(fb_user_id: str, message: str, tenant_id: str | None = None) -> str | None:
    """Send a Facebook Messenger message via Graph API. Returns message id or None on failure."""
    from app.config_dynamic import get_setting
    access_token = get_setting("facebook_access_token", tenant_id=tenant_id) or settings.facebook_access_token
    if not access_token:
        logger.error(f"facebook_access_token not configured for tenant {tenant_id} — cannot send Facebook DM")
        return None
    try:
        url = "https://graph.facebook.com/v21.0/me/messages"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                params={"access_token": access_token},
                json={
                    "recipient": {"id": fb_user_id},
                    "message": {"text": message},
                },
                timeout=15.0,
            )
            resp.raise_for_status()
            data = resp.json()
            mid = data.get("message_id")
            logger.info(f"Facebook sent to {fb_user_id}: mid={mid}")
            return mid
    except httpx.HTTPStatusError as e:
        logger.error(f"Facebook send failed to {fb_user_id}: {e.response.status_code} {e.response.text}")
        return None
    except Exception as e:
        logger.error(f"Facebook send failed to {fb_user_id}: {e}")
        return None


async def generate_reengagement_message(lead_id: str, cadence: str, db=None) -> str:
    db = db or get_supabase()
    lead = (
        db.table("leads")
        .select("name,segment")
        .eq("id", str(lead_id))
        .limit(1)
        .execute()
    )
    lead_data = lead.data[0] if lead.data else {}
    history_rows = list(reversed(_recent_thread(db, lead_id, limit=6)))
    history = "\n".join(
        f"{row.get('direction', 'unknown')}: {row.get('content', '').strip()}"
        for row in history_rows
        if (row.get("content") or "").strip()
    ) or "No prior conversation history available."

    prompt = f"""You write proactive WhatsApp re-engagement messages for a business.

Cadence: {cadence}
Lead name: {lead_data.get("name") or "there"}
Current segment: {lead_data.get("segment") or "C"}
Recent conversation:
{history}

Write a single WhatsApp message under 280 characters.
Be warm, specific, and low-pressure.
Reference the lead's interest naturally and end with one clear next step.
Do not use markdown or quotes."""
    try:
        text = await _groq_complete(prompt, max_tokens=120)
        return text[:280] if len(text) > 280 else text
    except Exception as e:
        logger.error(f"Re-engagement copy failed for lead {lead_id}: {e}")
        return REENGAGEMENT_FALLBACKS.get(cadence, REENGAGEMENT_FALLBACKS["1w"])


_ESCALATION_PHRASES = [
    "connect you with our team",
    "connect them with a team member",
    "let me connect",
    "our team will",
    "team will reach out",
    "team member will",
    "team will get back",
]

_HUMAN_REQUEST_RE = re.compile(
    r"""
    \b(
        (?:talk|speak|chat)\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+)?
            (?:human|person|agent|someone|representative|staff|team\s+member)
        |
        (?:want|need|like)\s+(?:to\s+)?(?:talk|speak|chat)\s+(?:to|with)\s+(?:a\s+|an\s+)?
            (?:human|person|agent|someone|representative)
        |
        connect\s+me\s+(?:to|with)\s+(?:a\s+|an\s+|the\s+)?
            (?:human|person|agent|team|someone|representative)
        |
        (?:get|find)\s+me\s+(?:a\s+)?(?:human|person|agent)
        |
        human\s+agent | real\s+person | live\s+agent
        |
        customer\s+(?:care|support|service)
        |
        can\s+i\s+speak | call\s+me
    )\b
    """,
    re.VERBOSE | re.IGNORECASE,
)

_GENERIC_FALLBACK_MARKERS = [
    "we'll get back to you shortly",
    "get back to you shortly",
    "team will get back to you",
]

_TRIGGER_PRIORITY = ["C", "B", "A", "D", "F", "E"]
_TRIGGER_REASONS: dict[str, str] = {
    "C": "User requested a human agent",
    "B": "AI failed to generate a response",
    "A": "AI gave a generic fallback reply",
    "D": "User repeated the same question",
    "F": "AI indicated team will follow up",
    "E": "Lead score crossed hot threshold",
}


def _is_similar(a: str, b: str, threshold: float = 0.6) -> bool:
    """True if two messages share ≥threshold fraction of words (rough duplicate check)."""
    wa = set(re.findall(r"\w+", a.lower()))
    wb = set(re.findall(r"\w+", b.lower()))
    if len(wa) < 3 or len(wb) < 3:
        return False
    return len(wa & wb) / max(len(wa), len(wb)) >= threshold


def _is_generic_fallback(text: str) -> bool:
    t = text.lower()
    return any(marker in t for marker in _GENERIC_FALLBACK_MARKERS)


def _trigger_chat_escalation(
    lead_id: str, reason: str, tenant_id: str, assigned_to: str | None, db,
    auto_assign: bool = False,
) -> None:
    existing = (
        db.table("chat_handovers")
        .select("id")
        .eq("lead_id", lead_id)
        .eq("status", "pending")
        .limit(1)
        .execute()
    )
    if existing and existing.data:
        return  # already has an open handover

    # Round-robin auto-assign if no one is assigned yet
    if assigned_to is None and auto_assign:
        assigned_to = auto_assign_lead(lead_id, tenant_id)

    db.table("leads").update({
        "needs_human_attention": True,
        "escalation_reason": reason,
        "ai_enabled": False,
    }).eq("id", lead_id).execute()

    db.table("chat_handovers").insert({
        "tenant_id": tenant_id,
        "lead_id": lead_id,
        "assigned_to": assigned_to,
        "reason": reason,
        "status": "pending",
    }).execute()
    logger.info(f"Chat handover created for lead {lead_id} — reason: {reason[:60]}")


async def generate_reply(
    lead_id: str,
    message: str,
    phone: str | None = None,
    channel: str = "whatsapp",
    ig_user_id: str | None = None,
    context_block: str | None = None,
    tg_user_id: str | None = None,
    fb_user_id: str | None = None,
) -> None:
    """
    Core pipeline:
    1. Inject knowledge base context
    2. Call Groq for reply
    3. Send reply via the matching channel
    4. Score the message and update lead score + segment in DB
    """
    db = get_supabase()

    # Step 0: fetch lead + load module configs
    lead_row = (
        db.table("leads")
        .select("ai_enabled,score,segment,phone,converted_at,tenant_id,assigned_to,name")
        .eq("id", str(lead_id))
        .limit(1)
        .execute()
    )
    lead_data = lead_row.data[0] if lead_row.data else {}
    tenant_id = lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001"
    segment = lead_data.get("segment") or "C"

    # Enforce global AI auto-reply toggle
    _ai_setting = (
        db.table("app_settings")
        .select("display_value")
        .eq("tenant_id", tenant_id)
        .eq("key", "ai_auto_reply_enabled")
        .limit(1)
        .execute()
    )
    if _ai_setting.data and _ai_setting.data[0].get("display_value") == "false":
        logger.info(f"AI auto-reply globally disabled for tenant {tenant_id} — skipping reply")
        return

    inbox_cfg = get_inbox_config(tenant_id)
    telecalling_cfg = get_telecalling_config(tenant_id)
    escalation_flags: set[str] = set()

    # Trigger C: user explicitly asked for human (always fires, not config-gated)
    if _HUMAN_REQUEST_RE.search(message):
        escalation_flags.add("C")
        logger.info(f"Trigger C: lead {lead_id} asked for human agent")

    # Pre-fetch recent thread (reused for trigger D + Groq chat below)
    recent_thread = _recent_thread(db, lead_id, limit=8)

    # Trigger D: user repeated the same question (AI not resolving it)
    # Skip the first inbound match — it's the current message (already stored before generate_reply runs).
    # We need the PREVIOUS inbound to compare against.
    if "D" in inbox_cfg.get("triggers", []):
        prev_inbounds = [r for r in recent_thread if r.get("direction") == "inbound"]
        prev_inbound = prev_inbounds[1] if len(prev_inbounds) > 1 else None
        if prev_inbound and _is_similar(message, prev_inbound.get("content", "")):
            escalation_flags.add("D")
            logger.info(f"Trigger D: lead {lead_id} repeated same question")
    from app.config_dynamic import get_setting
    global_ai_enabled = get_setting("ai_auto_reply_enabled", fallback="true", tenant_id=tenant_id) == "true"
    if (lead_data and lead_data.get("ai_enabled") is False) or not global_ai_enabled:
        logger.info(f"AI auto-reply is disabled (lead_ai_enabled={lead_data.get('ai_enabled')}, global_ai_enabled={global_ai_enabled}) — skipping auto-reply")
        # Still rescore via Score Engine v2 so admin sees segment updates during manual handling
        try:
            from app.services.scoring_engine import compute_score as _compute_score
            from datetime import timedelta
            _tid = lead_data.get("tenant_id")
            _bcast_ctx: dict | None = None
            try:
                _ctx_cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
                _br = (
                    db.table("broadcast_recipients")
                    .select("broadcast_id,tag_id,created_at")
                    .eq("lead_id", str(lead_id))
                    .not_.is_("broadcast_id", "null")
                    .gte("created_at", _ctx_cutoff)
                    .order("created_at", desc=True)
                    .limit(1)
                    .execute()
                )
                if _br.data:
                    _b = _br.data[0]
                    _bcast_ctx = {
                        "broadcast_id": _b["broadcast_id"],
                        "broadcast_sent_at": _b["created_at"],
                        "tag_id": _b.get("tag_id"),
                    }
            except Exception:
                pass
            _sr = await _compute_score(
                message=message, lead_id=str(lead_id), db=db,
                tenant_id=_tid, broadcast_context=_bcast_ctx,
            )
            new_score = _sr["score"]
            new_segment = _sr["segment"]
            if _sr.get("intent_reason") == "rejection" and lead_data.get("assigned_to"):
                try:
                    db.table("leads").update({"assigned_to": None}).eq("id", str(lead_id)).execute()
                    lead_data["assigned_to"] = None
                    logger.info(f"Lead {lead_id} unassigned after rejection (AI-disabled path)")
                except Exception:
                    pass
            _score_meta = {
                "new_score": new_score,
                "prev_score": lead_data.get("score", 5),
                "message_snippet": message[:150],
                "channel": channel,
                "reason": "ai_disabled_inbound",
            }
            if new_segment != lead_data.get("segment") or new_score != lead_data.get("score", 5):
                record_stage_event(
                    lead_id,
                    from_segment=lead_data.get("segment"),
                    to_segment=new_segment,
                    event_type="segment_changed" if new_segment != lead_data.get("segment") else "score_updated",
                    metadata=_score_meta,
                    tenant_id=_tid,
                    db=db,
                )
            sync_follow_up_jobs(
                lead_id,
                segment=new_segment,
                phone=lead_data.get("phone") or phone,
                converted_at=lead_data.get("converted_at"),
                ai_enabled=False,
                reason="ai_disabled",
                tenant_id=_tid,
                db=db,
            )
        except Exception as e:
            logger.error(f"Scoring update failed (takeover mode) for lead {lead_id}: {e}")
        return

    # Inject full knowledge base text if any documents are indexed
    try:
        context_text = await get_knowledge_context(lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001")
    except Exception as e:
        logger.warning(f"Knowledge context fetch failed for lead {lead_id}: {e}")
        context_text = ""

    _raw_reply = ""  # holds unstripped Groq output for [COLLECT_DONE] parser below
    try:
        system_prompt = _get_prompt(f"{channel}_reply", tenant_id=lead_data.get("tenant_id"))
        if context_text:
            system_prompt += "\n\nKNOWLEDGE BASE:\nUse the following documents to answer the user's question accurately. If the answer is not in the documents, say you will connect them with a team member.\n\n" + context_text

        lead_name = (lead_data.get("name") or "").strip()
        lead_segment = lead_data.get("segment") or "C"
        summary = _fetch_conversation_summary(db, lead_id)

        lead_facts: list[str] = []
        if lead_name:
            lead_facts.append(f"Lead name: {lead_name}")
        lead_facts.append(f"Current segment: {lead_segment} (A=hot, B=warm, C=cold, D=disqualified)")
        if summary:
            lead_facts.append(f"Earlier conversation summary:\n{summary}")
        system_prompt += "\n\nLEAD CONTEXT:\n" + "\n".join(lead_facts)

        system_prompt += (
            "\n\nLANGUAGE RULE: Reply in the SAME language the user just wrote in. "
            "If they write Tamil, reply Tamil. English -> English. Never switch unless they do."
        )

        # recent_thread already fetched at step 0 (reuse - no extra DB call)
        chat_messages: list[dict] = [{"role": "system", "content": system_prompt}]
        for row in reversed(recent_thread):  # oldest first
            content = (row.get("content") or "").strip()
            if not content:
                continue
            role = "assistant" if row.get("direction") == "outbound" else "user"
            chat_messages.append({"role": role, "content": content})

        # Inject language hint directly into the final user turn - strongest signal,
        # overrides any knowledge-base language that may dominate the system prompt.
        _user_lang_name = _LANG_NAMES.get(_detect_lang(message), "English")
        _tagged_message = f"[Respond in {_user_lang_name}] {message}"
        if not chat_messages or chat_messages[-1].get("role") != "user" or chat_messages[-1].get("content") != message:
            chat_messages.append({"role": "user", "content": _tagged_message})
        else:
            chat_messages[-1]["content"] = _tagged_message

        _raw_reply = await _groq_chat(chat_messages, max_tokens=600)
        is_ai = True
        reply_source = "knowledge" if context_text else "ai"

        # Strip [COLLECT_DONE] signal before sending to customer — the raw JSON
        # must never reach the channel delivery path or pollute thread history.
        # Keep _raw_reply intact for the parser below (after messages insert).
        _display_text = re.sub(r'^\s*\[COLLECT_DONE\]\s*\{.*\}\s*$', '', _raw_reply.strip(), flags=re.DOTALL).strip()
        reply_text = _display_text if _display_text != _raw_reply else _raw_reply
        if not reply_text:
            reply_text = "Thank you — we've got all your details. We'll be in touch shortly."

        # Trigger A: AI gave a generic fallback reply
        if _is_generic_fallback(reply_text):
            escalation_flags.add("A")
            logger.info(f"Trigger A: lead {lead_id} received generic fallback reply")
        # Trigger F: AI reply contained escalation phrases
        if any(phrase in reply_text.lower() for phrase in _ESCALATION_PHRASES):
            escalation_flags.add("F")

    except Exception as e:
        logger.error(f"Groq reply failed for lead {lead_id}: {e}")
        reply_text = _FALLBACK_BY_LANG.get(_detect_lang(message), _FALLBACK_BY_LANG["en"])
        is_ai = False
        reply_source = "ai"
        # Trigger B: AI/Groq exception - escalate so a human can pick up
        escalation_flags.add("B")
        logger.info(f"Trigger B: lead {lead_id} Groq exception - {e}")

    # Step 3: Dispatch to the correct channel
    if channel == "instagram":
        sid = await send_instagram(ig_user_id, reply_text, tenant_id=lead_data.get("tenant_id")) if ig_user_id else None
    elif channel == "telegram":
        sid = await send_telegram(tg_user_id, reply_text, tenant_id=lead_data.get("tenant_id")) if tg_user_id else None
    elif channel == "facebook":
        sid = await send_facebook(fb_user_id, reply_text, tenant_id=lead_data.get("tenant_id")) if fb_user_id else None
    else:
        _wa_phone = phone or lead_data.get("phone")
        sid = await send_whatsapp(_wa_phone, reply_text, tenant_id=lead_data.get("tenant_id")) if _wa_phone else None

    # Step 4: Store outbound message
    if channel == "telegram":
        sid_field = "tg_message_id"
    elif channel == "facebook":
        sid_field = "fb_message_id"
    elif channel == "whatsapp":
        sid_field = "meta_message_id"
    else:
        sid_field = "meta_message_id"  # instagram uses meta_message_id
    db.table("messages").insert({
        "lead_id": str(lead_id),
        "direction": "outbound",
        "channel": channel,
        "content": reply_text,
        "is_ai_generated": is_ai,
        "reply_source": reply_source,
        "tenant_id": lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001",
        sid_field: sid,
    }).execute()

    # Detect [COLLECT_DONE] signal — AI has finished collecting structured data.
    # Parser runs against _raw_reply so the stripped display text doesn't block detection.
    _collect_match = re.match(r'\s*\[COLLECT_DONE\]\s*(\{.*\})\s*$', _raw_reply.strip(), re.DOTALL)
    if _collect_match:
        try:
            import json as _json
            _collected = _json.loads(_collect_match.group(1))
            db.table("leads").update({"collected_data": _collected}).eq("id", str(lead_id)).execute()
            logger.info(f"[COLLECT_DONE] saved for lead {lead_id}: {list(_collected.keys())}")
            from app.config_dynamic import get_setting
            _post_action = get_setting("collect_post_action", tenant_id=tenant_id)
            if _post_action == "send_payment_link":
                try:
                    from app.services.booking_flow import _create_draft_booking
                    from app.services.payment_razorpay import create_payment_link
                    # Get or create booking row
                    _bk = db.table("bookings").select("id,booking_ref,amount_paise") \
                        .eq("lead_id", str(lead_id)).eq("tenant_id", tenant_id) \
                        .neq("status", "cancelled").order("created_at", desc=True).limit(1).execute()
                    _b = _bk.data[0] if _bk.data else _create_draft_booking(str(lead_id), tenant_id, db)
                    # Write collected fields onto booking row + mark pending_payment
                    db.table("bookings").update({
                        "devotee_name": _collected.get("devotee_name") or _collected.get("name") or "",
                        "rasi": _collected.get("rasi"),
                        "nakshatram": _collected.get("nakshatram"),
                        "gotram": _collected.get("gotram"),
                        "delivery_address": _collected.get("delivery_address") or _collected.get("address"),
                        "status": "pending_payment",
                    }).eq("id", _b["id"]).execute()
                    await create_payment_link(
                        booking_id=_b["id"],
                        booking_ref=_b.get("booking_ref", "REF"),
                        amount_paise=_b.get("amount_paise", 50000),
                        customer_name=_collected.get("devotee_name") or _collected.get("name") or "",
                        customer_phone=phone,
                    )
                except Exception as _pe:
                    logger.warning(f"Payment link failed for lead {lead_id}: {_pe}")
            elif _post_action == "notify_telecaller":
                try:
                    from app.routes.alerts import create_alert
                    create_alert(lead_id=str(lead_id), tenant_id=tenant_id, assigned_caller_id=lead_data.get("assigned_to"))
                except Exception as _ae:
                    logger.warning(f"Telecaller alert failed for lead {lead_id}: {_ae}")
        except Exception as _ce:
            logger.warning(f"[COLLECT_DONE] parse failed for lead {lead_id}: {_ce}")

    # Step 5: Score Engine v2 — composite arc + intent + engagement (no gate)
    new_segment = segment  # fallback if scoring fails
    new_score = lead_data.get("score", 5)
    try:
        from app.services.scoring_engine import compute_score
        from datetime import timedelta

        # Detect broadcast context: most recent tagged broadcast within 14 days
        _broadcast_context: dict | None = None
        try:
            _ctx_cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
            _recent_br = (
                db.table("broadcast_recipients")
                .select("broadcast_id,tag_id,created_at")
                .eq("lead_id", str(lead_id))
                .not_.is_("broadcast_id", "null")
                .gte("created_at", _ctx_cutoff)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            if _recent_br.data:
                _br = _recent_br.data[0]
                _broadcast_context = {
                    "broadcast_id": _br["broadcast_id"],
                    "broadcast_sent_at": _br["created_at"],
                    "tag_id": _br.get("tag_id"),
                }
        except Exception as _ctx_err:
            logger.warning(f"Broadcast context lookup failed for lead {lead_id}: {_ctx_err}")

        score_result = await compute_score(
            message=message,
            lead_id=str(lead_id),
            db=db,
            tenant_id=tenant_id,
            broadcast_context=_broadcast_context,
        )
        new_score = score_result["score"]
        new_segment = score_result["segment"]

        _score_meta = {
            "new_score": new_score,
            "prev_score": lead_data.get("score", 5),
            "arc_score": score_result["arc_score"],
            "intent_delta": score_result["intent_delta"],
            "engagement_delta": score_result["engagement_delta"],
            "intent_reason": score_result["intent_reason"],
            "arc_updated": score_result["arc_updated"],
            "message_snippet": message[:150],
            "channel": channel,
            "broadcast_id": (_broadcast_context or {}).get("broadcast_id"),
        }
        if new_segment != lead_data.get("segment") or new_score != lead_data.get("score", 5):
            record_stage_event(
                lead_id,
                from_segment=lead_data.get("segment"),
                to_segment=new_segment,
                event_type="segment_changed" if new_segment != lead_data.get("segment") else "score_updated",
                metadata=_score_meta,
                tenant_id=tenant_id,
                db=db,
            )
        old_segment = lead_data.get("segment") or "C"
        if score_result.get("intent_reason") == "rejection" and lead_data.get("assigned_to"):
            try:
                db.table("leads").update({"assigned_to": None}).eq("id", str(lead_id)).execute()
                lead_data["assigned_to"] = None
                logger.info(f"Lead {lead_id} unassigned after rejection")
            except Exception:
                pass
        if not lead_data.get("assigned_to") and new_segment != old_segment and should_assign_to_telecalling(telecalling_cfg, new_segment, channel):
            assigned_caller = auto_assign_lead(str(lead_id), tenant_id)
            if assigned_caller:
                lead_data["assigned_to"] = assigned_caller

        if new_score >= 7 and (lead_data.get("score") or 5) < 7:
            try:
                from app.routes.alerts import create_alert
                create_alert(
                    lead_id=str(lead_id),
                    tenant_id=tenant_id,
                    assigned_caller_id=lead_data.get("assigned_to"),
                )
            except Exception as alert_err:
                logger.warning(f"Alert creation failed for lead {lead_id}: {alert_err}")

            escalation_flags.add("E")

            try:
                from app.services.automation_triggers import _dispatch
                import asyncio
                asyncio.create_task(_dispatch(
                    lead_id=str(lead_id),
                    tenant_id=tenant_id,
                    trigger_type="score_threshold",
                    message=message,
                    is_first_message=False,
                    db=db,
                ))
            except Exception as auto_err:
                logger.warning(f"score_threshold trigger failed for lead {lead_id}: {auto_err}")
    except Exception as e:
        logger.error(f"Scoring update failed for lead {lead_id}: {e}")

    sync_follow_up_jobs(
        lead_id,
        segment=new_segment,
        phone=lead_data.get("phone") or phone,
        converted_at=lead_data.get("converted_at"),
        ai_enabled=lead_data.get("ai_enabled", True),
        reason=f"{channel}_reply",
        tenant_id=tenant_id,
        db=db,
    )

    # Step 6: Fire inbox escalation — trigger-based, no segment gate
    active_triggers = [
        t for t in _TRIGGER_PRIORITY
        if t in escalation_flags and should_escalate_to_inbox(inbox_cfg, t, channel)
    ]
    trigger_escalated = False
    if active_triggers:
        primary = active_triggers[0]
        try:
            _trigger_chat_escalation(
                lead_id=str(lead_id),
                reason=_TRIGGER_REASONS[primary],
                tenant_id=tenant_id,
                assigned_to=lead_data.get("assigned_to"),
                db=db,
                auto_assign=inbox_cfg.get("auto_assign_enabled", False),
            )
            trigger_escalated = True
            logger.info(f"Inbox escalation fired for lead {lead_id} — trigger {primary}")
        except Exception as e:
            logger.error(f"Inbox escalation failed for lead {lead_id}: {e}")

    # Segment-transition escalation — only fires if no trigger-based handover was created.
    # Uses pre-scoring segment (`segment`) vs post-scoring segment (`new_segment`).
    # auto_assign_enabled=ON routes to telecaller; OFF leaves handover unassigned for admin.
    if (
        not trigger_escalated
        and inbox_cfg.get("enabled")
        and new_segment != segment
        and new_segment in inbox_cfg.get("segments", [])
    ):
        try:
            _trigger_chat_escalation(
                lead_id=str(lead_id),
                reason=f"Lead entered {new_segment} segment",
                tenant_id=tenant_id,
                assigned_to=lead_data.get("assigned_to"),
                db=db,
                auto_assign=inbox_cfg.get("auto_assign_enabled", False),
            )
        except Exception as seg_err:
            logger.error(f"Inbox segment-transition escalation failed for lead {lead_id}: {seg_err}")
