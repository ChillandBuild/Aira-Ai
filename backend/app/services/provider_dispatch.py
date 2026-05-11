"""
Routes outbound WhatsApp sends to the correct provider based on phone_numbers.provider.

Supported providers:
  meta_cloud  — Meta Cloud API Direct (meta_cloud.py)
  bulkwise    — Bulkwise platform (bulkwise_cloud.py)
  wati        — WATI (future)

Number row shape (from phone_numbers table):
  provider              str   'meta_cloud' | 'bulkwise' | 'wati'
  meta_phone_number_id  str   Meta/Bulkwise phone_number_id
  api_key               str   Bulkwise apiToken (null for meta_cloud)
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


async def send_text(number_row: dict, to_number: str, text: str) -> Optional[str]:
    """Send a text message via the provider in number_row. Returns message id or None."""
    provider = (number_row.get("provider") or "meta_cloud").lower()
    phone_number_id = number_row.get("meta_phone_number_id")

    if provider == "bulkwise":
        api_token = number_row.get("api_key")
        if not api_token or not phone_number_id:
            logger.error("provider_dispatch: bulkwise number missing api_key or meta_phone_number_id")
            return None
        from app.services.bulkwise_cloud import send_text_message
        data = await send_text_message(to_number, text, phone_number_id, api_token)
        return data.get("wa_message_id")

    if provider == "meta_cloud":
        from app.services.meta_cloud import send_text_message
        from app.config_dynamic import get_setting
        access_token = get_setting("meta_access_token")
        data = await send_text_message(
            to_number=to_number,
            text=text,
            phone_number_id=phone_number_id,
            access_token=access_token,
        )
        msgs = data.get("messages") or [{}]
        return msgs[0].get("id")

    logger.error("provider_dispatch: unknown provider '%s'", provider)
    return None


async def send_media(
    number_row: dict,
    to_number: str,
    media_url: str,
    media_type: str,
    caption: Optional[str] = None,
) -> Optional[str]:
    """Send a media message via the provider in number_row. Returns message id or None."""
    provider = (number_row.get("provider") or "meta_cloud").lower()
    phone_number_id = number_row.get("meta_phone_number_id")

    if provider == "bulkwise":
        api_token = number_row.get("api_key")
        if not api_token or not phone_number_id:
            logger.error("provider_dispatch: bulkwise number missing credentials for media send")
            return None
        from app.services.bulkwise_cloud import send_media_message
        data = await send_media_message(to_number, media_url, media_type, phone_number_id, api_token, caption)
        return data.get("wa_message_id")

    if provider == "meta_cloud":
        from app.services.meta_cloud import upload_media_to_meta, send_media_message
        from app.config_dynamic import get_setting
        import httpx
        access_token = get_setting("meta_access_token")
        async with httpx.AsyncClient(timeout=30.0) as client:
            file_resp = await client.get(media_url)
        content_type = file_resp.headers.get("content-type", "application/octet-stream")
        filename = media_url.split("/")[-1].split("?")[0] or "file"
        media_id = await upload_media_to_meta(
            file_bytes=file_resp.content,
            mime_type=content_type,
            filename=filename,
            phone_number_id=phone_number_id,
            access_token=access_token,
        )
        data = await send_media_message(
            to_number=to_number,
            media_id=media_id,
            wa_type=media_type,
            caption=caption,
            phone_number_id=phone_number_id,
            access_token=access_token,
        )
        msgs = data.get("messages") or [{}]
        return msgs[0].get("id")

    logger.error("provider_dispatch: unknown provider '%s' for media send", provider)
    return None
