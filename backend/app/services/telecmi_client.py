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
    payload = {
        "agent_id": user_id,
        "token": secret,
        "to": _normalize_phone(to),
        "custom": "aira_ai_call"
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
    """Strip spaces/dashes and ensure the number is digits-only (with country code)."""
    cleaned = phone.replace(" ", "").replace("-", "").replace("+", "")
    # If it doesn't start with a country code, assume India (91)
    if len(cleaned) == 10:
        cleaned = f"91{cleaned}"
    return cleaned
