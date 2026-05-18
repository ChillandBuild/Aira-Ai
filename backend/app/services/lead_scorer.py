import logging
from groq import Groq
from app.config import settings

logger = logging.getLogger(__name__)

_client = Groq(api_key=settings.groq_api_key) if settings.groq_api_key else None
_SCORER_MODEL = "llama-3.1-8b-instant"

SCORING_PROMPT = """You are a lead scoring assistant for a B2B sales team.

Score this WhatsApp message from a prospect (1-10 integer):
- 9-10: High intent — asked for pricing, demo, or ready to buy, confirmed booking, completed booking flow
- 7-8: Warm — asking detailed questions, comparing options, multiple follow-ups, actively providing requested information
- 5-6: Neutral — general inquiry, first contact, acknowledgment without commitment
- 1-4: Low — no reply, said not interested, irrelevant message, dismissive

IMPORTANT: Use the context to understand the message.
- A short reply like "ok", "yes", or "thank you" AFTER completing a booking flow or providing requested info = high intent (8-10)
- The same message as a first contact or without context = neutral/low (3-5)
- If the user is actively engaged in a booking flow (providing name, rasi, address, etc.) = warm/high (7-10)
- "ok" or "thank you" during an active booking flow = acknowledgment of progress, not disinterest (7-9)

CONTEXT:
{context_block}

Previous score: {current_score}
Message: "{message}"

Reply with ONLY a single integer between 1 and 10. No explanation."""


async def score_message(message: str, current_score: int = 5, context_block: str | None = None) -> int:
    if not _client:
        logger.warning("GROQ_API_KEY not configured — skipping scoring")
        return current_score
    try:
        context = context_block or "No prior conversation context available."
        prompt = SCORING_PROMPT.format(
            context_block=context,
            current_score=current_score,
            message=message
        )
        response = _client.chat.completions.create(
            model=_SCORER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=4,
        )
        score = int(response.choices[0].message.content.strip())
        return max(1, min(10, score))
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        return current_score


async def score_with_safety_net(
    message: str,
    current_score: int,
    context_block: str,
    db,
    lead_id: str
) -> int:
    """
    Two-pass scoring:
    1. First pass: normal scoring with standard context
    2. If score < 5 (Segment D), trigger safety net re-evaluation with full context
    """
    # First pass
    first_score = await score_message(message, current_score, context_block)
    
    if first_score >= 5:
        return first_score  # Not Segment D, accept score
    
    # D-segment safety net: re-evaluate with full context
    logger.info(f"Lead {lead_id} scored {first_score} (Segment D) — triggering safety net re-evaluation")
    
    from app.services.context_builder import build_scorer_context
    full_context = build_scorer_context(lead_id, db, force_full_context=True)
    
    second_score = await score_message(message, current_score, full_context)
    
    logger.info(f"Safety net re-evaluation: {first_score} → {second_score}")
    
    return second_score
