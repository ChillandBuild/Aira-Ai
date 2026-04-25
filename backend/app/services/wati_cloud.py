import logging

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)


async def send_text_message(
    to_number: str,
    text: str,
    endpoint: str,
    api_key: str,
) -> dict:
    url = f"https://{endpoint}/api/v1/sendSessionMessage/{to_number}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            json={"messageText": text},
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if not resp.is_success:
        logger.error(
            "WATI send_text_message failed: %s %s",
            resp.status_code,
            resp.text,
        )
        raise HTTPException(status_code=502, detail=resp.text)
    data = resp.json()
    logger.info("WATI text sent to %s: %s", to_number, data)
    return data


async def send_template_message(
    to_number: str,
    template_name: str,
    params: list[str],
    endpoint: str,
    api_key: str,
) -> dict:
    url = f"https://{endpoint}/api/v1/sendTemplateMessage"
    payload = {
        "whatsappNumber": to_number,
        "templateName": template_name,
        "broadcastName": template_name,
        "parameters": [{"name": f"p{i + 1}", "value": v} for i, v in enumerate(params)],
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            url,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if not resp.is_success:
        logger.error(
            "WATI send_template_message failed: %s %s",
            resp.status_code,
            resp.text,
        )
        raise HTTPException(status_code=502, detail=resp.text)
    data = resp.json()
    logger.info("WATI template '%s' sent to %s: %s", template_name, to_number, data)
    return data


async def get_number_quality(endpoint: str, api_key: str) -> dict:
    url = f"https://{endpoint}/api/v1/getPhoneNumberDetails"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if not resp.is_success:
        logger.error(
            "WATI get_number_quality failed: %s %s",
            resp.status_code,
            resp.text,
        )
        raise HTTPException(status_code=502, detail=resp.text)
    data = resp.json()
    status = data.get("status", "")
    return {
        "quality_rating": "green" if status == "verified" else "yellow",
        "messaging_tier": 1000,
    }
