import logging
from typing import Optional

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

_BASE = "https://cloud.bulkwise.in/api/v1"


def _clean_number(phone: str) -> str:
    """Strip leading + — Bulkwise requires numeric-only with country code."""
    return phone.lstrip("+").strip()


async def send_text_message(
    to_number: str,
    text: str,
    phone_number_id: str,
    api_token: str,
) -> dict:
    url = f"{_BASE}/whatsapp/send"
    payload = {
        "apiToken": api_token,
        "phone_number_id": phone_number_id,
        "message": text,
        "phone_number": _clean_number(to_number),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, data=payload)
    data = resp.json()
    if not resp.is_success or str(data.get("status")) != "1":
        logger.error("bulkwise send_text_message failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=resp.status_code or 400, detail=data.get("message", resp.text))
    logger.info("Bulkwise text sent to %s via pid=%s", to_number, phone_number_id)
    return data


async def send_template_message(
    to_number: str,
    template_name: str,
    phone_number_id: str,
    api_token: str,
    components: Optional[list] = None,
) -> dict:
    """Send a pre-approved template via Bulkwise trigger-bot endpoint."""
    url = f"{_BASE}/whatsapp/trigger-bot"
    payload = {
        "apiToken": api_token,
        "phone_number_id": phone_number_id,
        "bot_flow_unique_id": template_name,
        "phone_number": _clean_number(to_number),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, data=payload)
    data = resp.json()
    if not resp.is_success or str(data.get("status")) != "1":
        logger.error("bulkwise send_template_message failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=resp.status_code or 400, detail=data.get("message", resp.text))
    logger.info("Bulkwise template '%s' triggered for %s", template_name, to_number)
    return data


async def send_media_message(
    to_number: str,
    media_url: str,
    media_type: str,
    phone_number_id: str,
    api_token: str,
    caption: Optional[str] = None,
) -> dict:
    url = f"{_BASE}/whatsapp/send/file"
    payload = {
        "apiToken": api_token,
        "phone_number_id": phone_number_id,
        "phone_number": _clean_number(to_number),
        "media_url": media_url,
        "media_type": media_type,
    }
    if caption:
        payload["media_caption_text"] = caption
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, data=payload)
    data = resp.json()
    if not resp.is_success or str(data.get("status")) != "1":
        logger.error("bulkwise send_media_message failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=resp.status_code or 400, detail=data.get("message", resp.text))
    logger.info("Bulkwise %s sent to %s", media_type, to_number)
    return data


async def get_template_list(phone_number_id: str, api_token: str) -> list:
    url = f"{_BASE}/whatsapp/template/list"
    payload = {"apiToken": api_token, "phone_number_id": phone_number_id}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, data=payload)
    data = resp.json()
    if not resp.is_success or str(data.get("status")) != "1":
        raise HTTPException(status_code=resp.status_code or 400, detail=data.get("message", resp.text))
    msg = data.get("message", [])
    return msg if isinstance(msg, list) else [msg]


async def create_subscriber(
    phone_number: str,
    name: str,
    phone_number_id: str,
    api_token: str,
) -> dict:
    url = f"{_BASE}/whatsapp/subscriber/create"
    payload = {
        "apiToken": api_token,
        "phoneNumberID": phone_number_id,
        "name": name,
        "phoneNumber": _clean_number(phone_number),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, data=payload)
    return resp.json()
