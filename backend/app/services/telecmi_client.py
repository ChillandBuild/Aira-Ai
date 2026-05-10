"""
TeleCMI Click-to-Call client.

Wraps the TeleCMI REST API for initiating outbound calls.
Docs: https://doc.telecmi.com/chub/docs/click-to-call-admin
"""
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

TELECMI_BASE_URL = "https://rest.telecmi.com/v2/click2call"


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
      1. TeleCMI rings the `callerid` (your telecaller) first.
      2. Once the telecaller picks up, TeleCMI bridges the call to `to` (the lead).

    Returns the TeleCMI response dict, e.g.:
        {"code": 200, "msg": "Call initiated", "request_id": "..."}
    """
    payload = {
        "appid": user_id,
        "app_secret": secret,
        "user_id": user_id,
        "secret": secret,
        "to": int(_normalize_phone(to)),
        "callerid": int(_normalize_phone(callerid)),
        "webrtc": webrtc,
        "followme": followme,
        "extra_params": extra_params or {"aira": "true"},
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
