import json
import logging

import httpx
from groq import AsyncGroq

from app.config import settings

logger = logging.getLogger(__name__)

_client = AsyncGroq(api_key=settings.groq_api_key) if settings.groq_api_key else None
_TRANSCRIBE_MODEL = "whisper-large-v3-turbo"
_SUMMARY_MODEL = "llama-3.3-70b-versatile"

_SUMMARIZE_SYSTEM = "You are analyzing a sales call transcript for a B2B sales team."

_SUMMARIZE_USER = (
    "Transcript:\n{transcript}\n\n"
    "Extract: product/service interested in, budget mentioned, timeline/deadline, "
    "recommended next action, overall sentiment (positive/neutral/negative). "
    "Return valid JSON only with keys: product, budget, timeline, next_action, sentiment."
)


async def transcribe_recording(recording_url: str) -> str:
    if not _client:
        logger.warning("GROQ_API_KEY not configured — skipping transcription")
        return ""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(recording_url)
            resp.raise_for_status()
            audio_bytes = resp.content
    except Exception as e:
        logger.error(f"Failed to download recording {recording_url}: {e}")
        return ""

    try:
        logger.info(f"Sending {len(audio_bytes)} bytes to Groq Whisper for transcription")
        result = await _client.audio.transcriptions.create(
            file=("recording.mp3", audio_bytes, "audio/mp3"),
            model=_TRANSCRIBE_MODEL,
        )
        transcript = (result.text or "").strip()
        logger.info(f"Transcription complete: {len(transcript)} chars")
        return transcript
    except Exception as e:
        logger.error(f"Groq transcription failed for {recording_url}: {e}")
        return ""


async def summarize_call(transcript: str, lead_name: str | None = None) -> dict:
    if not transcript or not _client:
        return {}

    user_prompt = _SUMMARIZE_USER.format(transcript=transcript)
    if lead_name:
        user_prompt = f"Lead name: {lead_name}\n\n" + user_prompt

    try:
        response = await _client.chat.completions.create(
            model=_SUMMARY_MODEL,
            messages=[
                {"role": "system", "content": _SUMMARIZE_SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=400,
        )
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Groq summary JSON: {e}")
        return {}
    except Exception as e:
        logger.error(f"Groq summarize_call failed: {e}")
        return {}


_EVALUATE_PROMPT = (
    "You are evaluating a sales call recording transcript. Assess the caller's performance.\n\n"
    "Transcript:\n{transcript}\n\n"
    "Return valid JSON only with these exact keys:\n"
    "- talk_ratio: integer 0-100, estimated percentage of time the caller was speaking\n"
    "- objection_handling: one of 'good', 'average', 'poor'\n"
    "- outcome_clarity: 'yes' if call ended with a clear next step, 'no' otherwise\n"
    "- overall_score: integer 1-10 for overall call quality\n"
    "- coaching_tip: string, one specific actionable improvement for the caller (max 50 words)"
)


async def evaluate_call(transcript: str) -> dict:
    if not transcript or not _client:
        return {}
    try:
        response = await _client.chat.completions.create(
            model=_SUMMARY_MODEL,
            messages=[
                {"role": "user", "content": _EVALUATE_PROMPT.format(transcript=transcript)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=300,
        )
        return json.loads(response.choices[0].message.content)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Groq evaluation JSON: {e}")
        return {}
    except Exception as e:
        logger.error(f"Groq evaluate_call failed: {e}")
        return {}
