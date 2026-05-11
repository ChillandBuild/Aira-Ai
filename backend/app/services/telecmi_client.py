"""
TeleCMI Click-to-Call client.

Wraps the TeleCMI REST API for initiating outbound calls.
Docs: https://doc.telecmi.com/chub/docs/click-to-call-admin
"""
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TELECMI_BASE_URL = "https://piopiy.telecmi.com/v1/adminConnect"


async def initiate_click2call(
    user_id: str,
    secret: str,
    to: str,
    callerid: str,
    *,
    extra_params: dict[str, Any] | None = None,
    webrtc: bool = True,
    followme: bool = False,
) -> dict[str, Any]:
    """
    Initiate a click-to-call via TeleCMI.

    Flow:
      1. TeleCMI rings the agent (`user_id` / `agent_id`) first.
      2. Once the agent picks up, TeleCMI bridges the call to `to` (the lead).

    Returns the TeleCMI response dict, e.g.:
        {"code": 200, "msg": "Call initiated", "request_id": "..."}
    """
    call_log_id = (extra_params or {}).get("call_log_id", "aira_ai_call")
    payload = {
        "agent_id": user_id,
        "token": secret,
        "to": _normalize_phone(to),
        "custom": str(call_log_id),
    }

    logger.info(f"TeleCMI click2call: to={to}, callerid={callerid}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(TELECMI_BASE_URL, json=payload)
        resp.raise_for_status()
        data = resp.json()

    logger.info(f"TeleCMI response: {data}")
    if data.get("code") != 200:
        error_msg = data.get("msg", "Unknown TeleCMI error")
        raise RuntimeError(f"TeleCMI error: {error_msg}")
    
    return data


def _normalize_phone(phone: str) -> str:
    """Return a 10-digit Indian mobile number as expected by TeleCMI CHUB India.

    TeleCMI India cluster expects bare 10-digit numbers (e.g. 6369781582),
    NOT the +91 / 91 prefixed form.
    """
    cleaned = phone.replace(" ", "").replace("-", "").replace("+", "")
    # Strip India country code prefix if present
    if cleaned.startswith("91") and len(cleaned) == 12:
        cleaned = cleaned[2:]  # strip leading "91"
    return cleaned
