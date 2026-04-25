import json
import logging

import httpx
import google.generativeai as genai

from app.config import settings
from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)

_gemini_configured = False


def _ensure_gemini():
    global _gemini_configured
    if not _gemini_configured:
        key = get_setting("gemini_api_key") or settings.gemini_api_key
        if key:
            genai.configure(api_key=key)
            _gemini_configured = True

_flash_model = genai.GenerativeModel("gemini-2.0-flash")
_pro_model = genai.GenerativeModel(
    "gemini-2.5-pro",
    generation_config={"response_mime_type": "application/json"},
)

_SUMMARIZE_SYSTEM = "You are analyzing a sales call transcript for an education consultancy."

_SUMMARIZE_USER = (
    "Transcript:\n{transcript}\n\n"
    "Extract: course interested in, budget mentioned, timeline/deadline, "
    "recommended next action, overall sentiment (positive/neutral/negative). "
    "Return valid JSON only with keys: course, budget, timeline, next_action, sentiment."
)


async def transcribe_recording(recording_url: str) -> str:
    _ensure_gemini()
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(recording_url)
            resp.raise_for_status()
            audio_bytes = resp.content
    except Exception as e:
        logger.error(f"Failed to download recording {recording_url}: {e}")
        return ""

    try:
        part = {"inline_data": {"mime_type": "audio/mp3", "data": audio_bytes}}
        prompt = "Transcribe this audio recording of a sales call. Return only the transcript, no commentary."
        response = _flash_model.generate_content([prompt, part])
        return response.text.strip()
    except Exception as e:
        logger.error(f"Gemini transcription failed for {recording_url}: {e}")
        return ""


async def summarize_call(transcript: str, lead_name: str | None = None) -> dict:
    if not transcript:
        return {}

    user_prompt = _SUMMARIZE_USER.format(transcript=transcript)
    if lead_name:
        user_prompt = f"Lead name: {lead_name}\n\n" + user_prompt

    try:
        response = _pro_model.generate_content(
            [
                {"role": "user", "parts": [_SUMMARIZE_SYSTEM + "\n\n" + user_prompt]},
            ]
        )
        return json.loads(response.text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse Gemini summary JSON: {e}")
        return {}
    except Exception as e:
        logger.error(f"Gemini summarize_call failed: {e}")
        return {}
