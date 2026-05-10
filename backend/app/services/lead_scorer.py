import logging
from groq import Groq
from app.config import settings

logger = logging.getLogger(__name__)

_client = Groq(api_key=settings.groq_api_key) if settings.groq_api_key else None
_SCORER_MODEL = "llama-3.1-8b-instant"

SCORING_PROMPT = """You are a lead scoring assistant for a B2B sales team.

Score this WhatsApp message from a prospect (1-10 integer):
- 9-10: High intent — asked for pricing, demo, or ready to buy
- 7-8: Warm — asking detailed questions, comparing options, multiple follow-ups
- 5-6: Neutral — general inquiry, first contact
- 1-4: Low — no reply, said not interested, irrelevant message

Previous score: {current_score}
Message: "{message}"

Reply with ONLY a single integer between 1 and 10. No explanation."""


async def score_message(message: str, current_score: int = 5) -> int:
    if not _client:
        logger.warning("GROQ_API_KEY not configured — skipping scoring")
        return current_score
    try:
        prompt = SCORING_PROMPT.format(current_score=current_score, message=message)
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
