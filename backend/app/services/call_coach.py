import logging
from groq import Groq
from app.config import settings
from app.db.supabase import get_supabase

logger = logging.getLogger(__name__)

_client = Groq(api_key=settings.groq_api_key) if settings.groq_api_key else None
_MODEL = "llama-3.3-70b-versatile"

COACH_PROMPT = """You are a sales coach for B2B telecallers.
Given a caller's recent call stats, return ONE short actionable coaching tip (max 25 words).
Focus on concrete phrases they can use on their next call. No preamble, no markdown.
"""


def _summarize_logs(logs: list[dict]) -> str:
    if not logs:
        return "No call history yet."
    total = len(logs)
    converted = sum(1 for l in logs if l.get("outcome") == "converted")
    not_interested = sum(1 for l in logs if l.get("outcome") == "not_interested")
    no_answer = sum(1 for l in logs if l.get("outcome") == "no_answer")
    avg_duration = sum((l.get("duration_seconds") or 0) for l in logs) / total
    scores = [float(l["score"]) for l in logs if l.get("score") is not None]
    avg_score = sum(scores) / len(scores) if scores else None
    parts = [
        f"Calls: {total}",
        f"Conversions: {converted}",
        f"Not interested: {not_interested}",
        f"No answer: {no_answer}",
        f"Avg duration: {avg_duration:.0f}s",
    ]
    if avg_score is not None:
        parts.append(f"Avg score: {avg_score:.1f}/10")
    return " · ".join(parts)


async def coaching_tip(caller_id: str) -> str:
    db = get_supabase()
    logs = (
        db.table("call_logs")
        .select("outcome,duration_seconds,score,notes")
        .eq("caller_id", caller_id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    summary = _summarize_logs(logs.data or [])
    if not _client:
        return "Keep calls under 3 minutes and always end with: 'Can I schedule a quick demo?'"
    try:
        response = _client.chat.completions.create(
            model=_MODEL,
            messages=[{"role": "user", "content": COACH_PROMPT + "\n\nCaller stats: " + summary}],
            temperature=0.5,
            max_tokens=80,
        )
        return response.choices[0].message.content.strip()
    except Exception as e:
        logger.error(f"Coaching tip failed for caller {caller_id}: {e}")
        return "Keep calls under 3 minutes and always end with: 'Can I schedule a quick demo?'"
