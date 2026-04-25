import logging
import google.generativeai as genai
from app.config import settings

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.gemini_api_key)
_scorer_model = genai.GenerativeModel("gemini-2.5-flash-lite")

SCORING_PROMPT = """You are a lead scoring assistant for an education consultancy.

Score this WhatsApp message from a prospective student (1-10 integer):
- 9-10: High intent — mentioned college visit, specific course, asked for fees/admission date
- 7-8: Warm — asking detailed questions, comparing options, multiple messages
- 5-6: Neutral — general inquiry, first contact
- 1-4: Low — no reply, said not interested, irrelevant message

Previous score: {current_score}
Message: "{message}"

Reply with ONLY a single integer between 1 and 10. No explanation."""

async def score_message(message: str, current_score: int = 5) -> int:
    """Score a lead message using Gemini Flash. Returns integer 1-10."""
    try:
        prompt = SCORING_PROMPT.format(current_score=current_score, message=message)
        response = _scorer_model.generate_content(prompt)
        score_text = response.text.strip()
        score = int(score_text)
        return max(1, min(10, score))  # clamp to 1-10
    except Exception as e:
        logger.error(f"Scoring failed: {e}")
        return current_score  # fallback to current score on error
