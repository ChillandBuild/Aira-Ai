import logging
import time
import httpx
import google.generativeai as genai
from app.config import settings
from app.config_dynamic import get_setting
from app.db.supabase import get_supabase
from app.services.growth import record_stage_event, sync_follow_up_jobs
from app.services.lead_scorer import score_message
from app.services.segmentation import score_to_segment
from app.services.knowledge_service import get_knowledge_context
from app.services.assignment import auto_assign_lead

logger = logging.getLogger(__name__)

_gemini_configured = False


def _ensure_gemini():
    global _gemini_configured
    if not _gemini_configured:
        key = get_setting("gemini_api_key") or settings.gemini_api_key
        if key:
            genai.configure(api_key=key)
            _gemini_configured = True


_reply_model = genai.GenerativeModel("gemini-2.5-flash-lite")

FALLBACK_PROMPT = """You are an AI assistant for an education consultancy. Your job is to help
prospective students with queries about college admissions, courses, fees, and visits.

Be warm, helpful, and professional. Keep replies concise (2-3 sentences max).
Always encourage the next step: booking a visit, asking for a brochure, or calling the office.

If asked about specific fees or dates you don't know, say: "Let me connect you with our
counsellor who can share the exact details. Can I get your preferred time for a callback?"
"""

REENGAGEMENT_FALLBACKS = {
    "1d": "Hi! Just checking in in case you still want help with admissions, fees, or course options. If you'd like, I can help you shortlist the right next step today.",
    "1w": "Hi! Following up in case your study plans are still active. If you want updated guidance on courses, fees, or a campus visit, reply here and I’ll help you quickly.",
    "1m": "Hi! Reaching out one last time in case admissions support is still useful. If you'd like fresh guidance on programs, fees, or booking a visit, just reply and we can pick this back up.",
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
        row = query.maybe_single().execute()
        content = (row.data or {}).get("content") or FALLBACK_PROMPT
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

def _check_faq(message: str, db) -> str | None:
    """Check FAQ table for a keyword match. Returns answer or None."""
    try:
        message_lower = message.lower()
        faqs = db.table("faqs").select("id,answer,keywords").eq("active", True).execute()
        for faq in (faqs.data or []):
            keywords = faq.get("keywords") or []
            if any(kw.lower() in message_lower for kw in keywords if kw):
                # increment hit count
                db.table("faqs").update({"hit_count": (faq.get("hit_count", 0) or 0) + 1}).eq("id", faq["id"]).execute()
                return faq["answer"]
    except Exception as e:
        logger.error(f"FAQ check failed: {e}")
    return None

_LAST_SEND_ERROR: str | None = None


def get_last_send_error() -> str | None:
    return _LAST_SEND_ERROR


async def send_whatsapp(to_phone: str, message: str) -> str | None:
    """Send a WhatsApp message via Meta Cloud API. Returns message ID or None on failure."""
    global _LAST_SEND_ERROR
    try:
        from app.services.meta_cloud import send_text_message
        data = await send_text_message(to_number=to_phone, text=message)
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

def send_instagram(ig_user_id: str, message: str) -> str | None:
    """Send an Instagram DM via Instagram Graph API. Returns message id or None on failure."""
    if not settings.meta_page_token:
        logger.error("META_PAGE_TOKEN not configured — cannot send Instagram DM")
        return None
    try:
        url = "https://graph.instagram.com/v21.0/me/messages"
        resp = httpx.post(
            url,
            params={"access_token": settings.meta_page_token},
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


def generate_reengagement_message(lead_id: str, cadence: str, db=None) -> str:
    db = db or get_supabase()
    lead = (
        db.table("leads")
        .select("name,segment")
        .eq("id", str(lead_id))
        .maybe_single()
        .execute()
    )
    lead_data = lead.data or {}
    history_rows = list(reversed(_recent_thread(db, lead_id, limit=6)))
    history = "\n".join(
        f"{row.get('direction', 'unknown')}: {row.get('content', '').strip()}"
        for row in history_rows
        if (row.get("content") or "").strip()
    ) or "No prior conversation history available."

    prompt = f"""You write proactive WhatsApp re-engagement messages for an education consultancy.

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
        response = _reply_model.generate_content(prompt)
        text = response.text.strip()
        return text[:280] if len(text) > 280 else text
    except Exception as e:
        logger.error(f"Re-engagement copy failed for lead {lead_id}: {e}")
        return REENGAGEMENT_FALLBACKS.get(cadence, REENGAGEMENT_FALLBACKS["1w"])
async def generate_reply(
    lead_id: str,
    message: str,
    phone: str | None = None,
    channel: str = "whatsapp",
    ig_user_id: str | None = None,
) -> None:
    """
    Core pipeline:
    1. Check FAQ table (keyword match)
    2. If no FAQ hit, call Gemini for reply
    3. Send reply via the matching channel
    4. Score the message and update lead score + segment in DB
    """
    db = get_supabase()

    # Step 0: respect human-takeover flag
    lead_row = (
        db.table("leads")
        .select("ai_enabled,score,segment,phone,converted_at,tenant_id,assigned_to")
        .eq("id", str(lead_id))
        .maybe_single()
        .execute()
    )
    lead_data = lead_row.data or {}
    if lead_data and lead_data.get("ai_enabled") is False:
        logger.info(f"Lead {lead_id} has AI disabled — skipping auto-reply")
        # Still rescore so the admin sees segment updates even while handling manually
        try:
            current_score = lead_data.get("score", 5)
            new_score = await score_message(message, current_score)
            new_segment = score_to_segment(new_score)
            db.table("leads").update({
                "score": new_score,
                "segment": new_segment,
            }).eq("id", str(lead_id)).execute()
            if new_segment != lead_data.get("segment"):
                record_stage_event(
                    lead_id,
                    from_segment=lead_data.get("segment"),
                    to_segment=new_segment,
                    event_type="segment_changed",
                    metadata={"reason": "ai_disabled_inbound"},
                    tenant_id=lead_data.get("tenant_id"),
                    db=db,
                )
            sync_follow_up_jobs(
                lead_id,
                segment=new_segment,
                phone=lead_data.get("phone") or phone,
                converted_at=lead_data.get("converted_at"),
                ai_enabled=False,
                reason="ai_disabled",
                db=db,
            )
        except Exception as e:
            logger.error(f"Scoring update failed (takeover mode) for lead {lead_id}: {e}")
        return

    # Step 1: FAQ check (no LLM cost)
    faq_answer = _check_faq(message, db)
    
    context_text = ""

    if faq_answer:
        reply_text = faq_answer
        is_ai = False
        reply_source = "faq"
        logger.info(f"FAQ hit for lead {lead_id}")
    else:
        # Step 2: Inject full knowledge base text if any documents are indexed
        try:
            context_text = await get_knowledge_context(lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001")
        except Exception as e:
            logger.warning(f"Knowledge context fetch failed for lead {lead_id}: {e}")
            context_text = ""

        try:
            system_prompt = _get_prompt(f"{channel}_reply", tenant_id=lead_data.get("tenant_id"))
            if context_text:
                system_prompt += "\n\nKNOWLEDGE BASE:\nUse the following documents to answer the user's question accurately. If the answer is not in the documents, say you will connect them with a team member.\n\n" + context_text

            response = _reply_model.generate_content(
                [{"role": "user", "parts": [system_prompt + "\n\nStudent message: " + message]}]
            )
            reply_text = response.text.strip()
            is_ai = True
            reply_source = "knowledge" if context_text else "ai"
            
            # Check for fallback to human
            fallback_phrases = ["counsellor", "specialist", "team member", "connect you with", "contact you shortly", "reach out to you"]
            if any(phrase in reply_text.lower() for phrase in fallback_phrases):
                logger.info(f"Fallback detected for lead {lead_id}, flagging for human intervention.")
                db.table("leads").update({
                    "needs_human_intervention": True,
                    "ai_enabled": False
                }).eq("id", str(lead_id)).execute()
                
                if not lead_data.get("assigned_to"):
                    auto_assign_lead(str(lead_id), lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001")
                    
        except Exception as e:
            logger.error(f"Gemini reply failed for lead {lead_id}: {e}")
            reply_text = "Thank you for reaching out! Our counsellor will contact you shortly."
            is_ai = False
            reply_source = "ai"
            
            # Fallback trigger
            db.table("leads").update({
                "needs_human_intervention": True,
                "ai_enabled": False
            }).eq("id", str(lead_id)).execute()
            if not lead_data.get("assigned_to"):
                auto_assign_lead(str(lead_id), lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001")

    # Step 3: Dispatch to the correct channel
    if channel == "instagram":
        sid = send_instagram(ig_user_id, reply_text) if ig_user_id else None
    else:
        sid = await send_whatsapp(phone, reply_text) if phone else None

    # Step 4: Store outbound message
    sid_field = "meta_message_id" if channel == "whatsapp" else "twilio_message_sid"
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

    # Step 5: Re-score lead and update segment
    try:
        current_score = lead_data.get("score", 5)
        new_score = await score_message(message, current_score)
        new_segment = score_to_segment(new_score)
        db.table("leads").update({
            "score": new_score,
            "segment": new_segment,
        }).eq("id", str(lead_id)).execute()
        if new_segment != lead_data.get("segment"):
            record_stage_event(
                lead_id,
                from_segment=lead_data.get("segment"),
                to_segment=new_segment,
                event_type="segment_changed",
                metadata={"reason": f"{channel}_reply"},
                tenant_id=lead_data.get("tenant_id"),
                db=db,
            )
        sync_follow_up_jobs(
            lead_id,
            segment=new_segment,
            phone=lead_data.get("phone") or phone,
            converted_at=lead_data.get("converted_at"),
            ai_enabled=lead_data.get("ai_enabled", True),
            reason=f"{channel}_reply",
            db=db,
        )
        logger.info(f"Lead {lead_id} scored {new_score} → segment {new_segment}")
        if new_score >= 7 and (lead_data.get("score") or 5) < 7:
            # Voice Call Handoff trigger
            if not lead_data.get("assigned_to"):
                assigned_caller = auto_assign_lead(str(lead_id), lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001")
                if assigned_caller:
                    lead_data["assigned_to"] = assigned_caller
            
            try:
                from app.routes.alerts import create_alert
                create_alert(
                    lead_id=str(lead_id),
                    tenant_id=lead_data.get("tenant_id") or "00000000-0000-0000-0000-000000000001",
                    assigned_caller_id=lead_data.get("assigned_to"),
                )
            except Exception as alert_err:
                logger.warning(f"Alert creation failed for lead {lead_id}: {alert_err}")
    except Exception as e:
        logger.error(f"Scoring update failed for lead {lead_id}: {e}")
