import json
import logging
from typing import Optional

import httpx
from fastapi import HTTPException

from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)


class TemplateContentExistsError(HTTPException):
    """Raised when Meta rejects template creation because name+language already exists."""
    pass

_GRAPH_BASE = "https://graph.facebook.com/v18.0"

_TIER_MAP = {
    "TIER_1000": 1000,
    "TIER_10000": 10000,
    "TIER_100000": 100000,
}

# Allowed MIME types and their WhatsApp message type
_MIME_TO_WA_TYPE: dict[str, str] = {
    # Images
    "image/jpeg": "image",
    "image/jpg": "image",
    "image/png": "image",
    "image/webp": "image",
    # Documents
    "application/pdf": "document",
    "application/msword": "document",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
    "application/vnd.ms-excel": "document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
    "application/vnd.ms-powerpoint": "document",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
    "text/plain": "document",
    "text/csv": "document",
    # Audio
    "audio/ogg": "audio",
    "audio/mpeg": "audio",
    "audio/mp3": "audio",
    "audio/aac": "audio",
    "audio/amr": "audio",
    "audio/wav": "audio",
    "audio/webm": "audio",
    # Video
    "video/mp4": "video",
    "video/3gpp": "video",
}


def get_wa_type_for_mime(mime_type: str) -> str:
    """Return WhatsApp message type for a given MIME type."""
    return _MIME_TO_WA_TYPE.get(mime_type.lower().split(";")[0].strip(), "document")


def _creds(phone_number_id: Optional[str], access_token: Optional[str], tenant_id: Optional[str] = None) -> tuple[str, str]:
    pid = phone_number_id or get_setting("meta_phone_number_id", tenant_id=tenant_id)
    tok = access_token or get_setting("meta_access_token", tenant_id=tenant_id)
    if not pid or not tok:
        raise HTTPException(status_code=400, detail="Meta credentials not configured. Set them in Settings.")
    return pid, tok


async def send_text_message(
    to_number: str,
    text: str,
    phone_number_id: Optional[str] = None,
    access_token: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> dict:
    pid, tok = _creds(phone_number_id, access_token, tenant_id)
    url = f"{_GRAPH_BASE}/{pid}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "text",
        "text": {"body": text},
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {tok}"})
    if not resp.is_success:
        logger.error("send_text_message failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    logger.info("Meta text sent to %s", to_number)
    return data


async def upload_media_to_meta(
    file_bytes: bytes,
    mime_type: str,
    filename: str,
    phone_number_id: Optional[str] = None,
    access_token: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> str:
    """Upload a file to Meta's media hosting and return the media ID."""
    pid, tok = _creds(phone_number_id, access_token, tenant_id)
    url = f"{_GRAPH_BASE}/{pid}/media"
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {tok}"},
            data={"messaging_product": "whatsapp"},
            files={"file": (filename, file_bytes, mime_type)},
        )
    if not resp.is_success:
        logger.error("upload_media_to_meta failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=resp.status_code, detail=f"Media upload failed: {resp.text}")
    data = resp.json()
    media_id = data.get("id")
    if not media_id:
        raise HTTPException(status_code=500, detail="No media ID returned from Meta")
    logger.info("Media uploaded to Meta, id=%s", media_id)
    return media_id


async def send_media_message(
    to_number: str,
    media_id: str,
    wa_type: str,
    filename: Optional[str] = None,
    caption: Optional[str] = None,
    phone_number_id: Optional[str] = None,
    access_token: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> dict:
    """
    Send a media message via Meta Cloud API.
    wa_type: 'image' | 'document' | 'audio' | 'video'
    """
    pid, tok = _creds(phone_number_id, access_token, tenant_id)
    url = f"{_GRAPH_BASE}/{pid}/messages"

    media_obj: dict = {"id": media_id}
    if caption and wa_type in ("image", "video", "document"):
        media_obj["caption"] = caption
    if filename and wa_type == "document":
        media_obj["filename"] = filename

    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": wa_type,
        wa_type: media_obj,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {tok}"})
    if not resp.is_success:
        logger.error("send_media_message failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    logger.info("Meta %s sent to %s", wa_type, to_number)
    return data


async def download_media_from_meta(
    media_id: str,
    access_token: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> tuple[bytes, str, str]:
    """
    Download media from Meta by media_id.
    Returns: (bytes, mime_type, url)
    """
    _, tok = _creds("placeholder", access_token, tenant_id)
    # First get the media URL
    async with httpx.AsyncClient(timeout=15.0) as client:
        info_resp = await client.get(
            f"{_GRAPH_BASE}/{media_id}",
            headers={"Authorization": f"Bearer {tok}"},
        )
    if not info_resp.is_success:
        raise HTTPException(status_code=info_resp.status_code, detail="Failed to get media info")
    info = info_resp.json()
    media_url = info.get("url", "")
    mime_type = info.get("mime_type", "application/octet-stream")

    # Download the actual file
    async with httpx.AsyncClient(timeout=60.0) as client:
        file_resp = await client.get(media_url, headers={"Authorization": f"Bearer {tok}"})
    if not file_resp.is_success:
        raise HTTPException(status_code=file_resp.status_code, detail="Failed to download media")

    return file_resp.content, mime_type, media_url


async def send_template_message(
    to_number: str,
    template_name: str,
    lang_code: str = "en",
    components: Optional[list] = None,
    phone_number_id: Optional[str] = None,
    access_token: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> dict:
    pid, tok = _creds(phone_number_id, access_token, tenant_id)
    url = f"{_GRAPH_BASE}/{pid}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to_number,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": lang_code},
            "components": components or [],
        },
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {tok}"})
    if not resp.is_success:
        logger.error("send_template_message failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    logger.info("Meta template '%s' sent to %s", template_name, to_number)
    return data


def _extract_variable_examples(body_text: str) -> list[str]:
    """Return placeholder example values for every {{N}} variable in the body."""
    import re
    indices = sorted(set(int(m) for m in re.findall(r"\{\{(\d+)\}\}", body_text)))
    examples = ["Sample text"] * len(indices)
    # Use a descriptive placeholder for {{1}} which is almost always the customer name
    if indices and indices[0] == 1:
        examples[0] = "Rajan Kumar"
    return examples


async def submit_template(
    waba_id: str,
    name: str,
    category: str,
    language: str,
    body_text: str,
    header_text: Optional[str] = None,
    header_media_type: Optional[str] = None,  # IMAGE | VIDEO | DOCUMENT | LOCATION
    header_media_url: Optional[str] = None,
    footer_text: Optional[str] = None,
    buttons: list[dict] | None = None,  # Structured buttons
    access_token: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> dict:
    _, tok = _creds("placeholder", access_token, tenant_id)
    url = f"{_GRAPH_BASE}/{waba_id}/message_templates"

    body_component: dict = {"type": "BODY", "text": body_text}
    examples = _extract_variable_examples(body_text)
    if examples:
        body_component["example"] = {"body_text": [examples]}

    components: list[dict] = [body_component]

    # Handle header (text or media)
    if header_media_type and header_media_type != "NONE":
        # Media header
        media_format = header_media_type.upper()
        header_component: dict = {"type": "HEADER", "format": media_format}
        if header_media_url:
            # Add example for media approval
            if media_format == "LOCATION":
                header_component["example"] = {"header_handle": [header_media_url]}
            else:
                header_component["example"] = {"header_handle": [header_media_url]}
        components.append(header_component)
    elif header_text and header_text.strip():
        # Text header
        components.append({
            "type": "HEADER",
            "format": "TEXT",
            "text": header_text.strip()[:60]
        })
        
    if footer_text and footer_text.strip():
        components.append({
            "type": "FOOTER",
            "text": footer_text.strip()[:60]
        })

    if buttons:
        import re
        _emoji_pattern = re.compile(
            "["
            "\U0001F600-\U0001F64F"  # emoticons
            "\U0001F300-\U0001F5FF"  # symbols & pictographs
            "\U0001F680-\U0001F6FF"  # transport & map
            "\U0001F1E0-\U0001F1FF"  # flags
            "\U00002702-\U000027B0"
            "\U000024C2-\U0001F251"
            "]+", flags=re.UNICODE
        )
        def _strip_emojis(text: str) -> str:
            return _emoji_pattern.sub("", text).strip()

        button_components: list[dict] = []
        for btn in buttons[:3]:  # Max 3 buttons
            btn_type = btn.get("type", "QUICK_REPLY")
            btn_text = _strip_emojis(btn.get("text", "")[:25])
            
            if btn_type == "QUICK_REPLY":
                button_components.append({
                    "type": "QUICK_REPLY",
                    "text": btn_text
                })
            elif btn_type == "URL":
                url_val = btn.get("url", "")
                button_components.append({
                    "type": "URL",
                    "text": btn_text,
                    "url": url_val,
                    "example": [url_val]
                })
            elif btn_type == "PHONE_NUMBER":
                phone = btn.get("phone", "")
                country = btn.get("country", "+1")
                button_components.append({
                    "type": "PHONE_NUMBER",
                    "text": btn_text,
                    "phone_number": f"{country} {phone}"
                })
            elif btn_type == "WHATSAPP_CALL":
                phone = btn.get("phone", "")
                country = btn.get("country", "+1")
                button_components.append({
                    "type": "PHONE_NUMBER",
                    "text": btn_text,
                    "phone_number": f"{country} {phone}"
                })
            elif btn_type == "COPY_CODE":
                offer_code = btn.get("offer_code", "")
                button_components.append({
                    "type": "COPY_CODE",
                    "text": btn_text,
                    "example": [offer_code]
                })
        
        if button_components:
            components.append({
                "type": "BUTTONS",
                "buttons": button_components
            })

    payload = {
        "name": name,
        "category": category.upper(),
        "language": language,
        "components": components,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, json=payload, headers={"Authorization": f"Bearer {tok}"})
    if not resp.is_success:
        logger.error("submit_template failed: %s %s", resp.status_code, resp.text)
        try:
            err_body = json.loads(resp.text)
            err_subcode = err_body.get("error", {}).get("error_subcode")
            if err_subcode == 2388024:
                user_msg = err_body.get("error", {}).get("error_user_msg", "Content already exists")
                raise TemplateContentExistsError(
                    status_code=409,
                    detail=f"A template with this name and language already exists on Meta. {user_msg}",
                )
        except json.JSONDecodeError:
            pass
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


async def get_number_quality(
    phone_number_id: Optional[str] = None,
    access_token: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> dict:
    pid, tok = _creds(phone_number_id, access_token, tenant_id)
    url = f"{_GRAPH_BASE}/{pid}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            url,
            params={"fields": "quality_rating,messaging_limit_tier"},
            headers={"Authorization": f"Bearer {tok}"},
        )
    if not resp.is_success:
        logger.error("get_number_quality failed: %s %s", resp.status_code, resp.text)
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    data = resp.json()
    return {
        "quality_rating": data.get("quality_rating", "UNKNOWN"),
        "messaging_tier": _TIER_MAP.get(data.get("messaging_limit_tier", ""), 0),
    }


async def get_template_status(
    waba_id: str,
    template_name: str,
    access_token: Optional[str] = None,
    tenant_id: Optional[str] = None,
) -> dict | None:
    """
    Fetch current template status from Meta.
    Returns the first matching template dict or None if not found.
    """
    _, tok = _creds("placeholder", access_token, tenant_id)
    url = f"{_GRAPH_BASE}/{waba_id}/message_templates"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            url,
            params={"name": template_name, "fields": "name,status,rejected_reason"},
            headers={"Authorization": f"Bearer {tok}"},
        )
    if not resp.is_success:
        logger.error("get_template_status failed: %s %s", resp.status_code, resp.text)
        return None
    data = resp.json().get("data", [])
    return data[0] if data else None


async def list_all_templates(
    waba_id: str,
    access_token: Optional[str] = None,
) -> list[dict]:
    """
    Fetch all templates from Meta for a WABA, handling pagination.
    Returns list of template dicts with name, status, category, language, components, rejected_reason.
    """
    _, tok = _creds("placeholder", access_token)
    url = f"{_GRAPH_BASE}/{waba_id}/message_templates"
    params = {
        "fields": "name,status,category,language,components,rejected_reason",
        "limit": 100,
    }
    templates: list[dict] = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        while url:
            resp = await client.get(url, params=params, headers={"Authorization": f"Bearer {tok}"})
            if not resp.is_success:
                logger.error("list_all_templates failed: %s %s", resp.status_code, resp.text)
                break
            body = resp.json()
            templates.extend(body.get("data", []))
            next_url = body.get("paging", {}).get("next")
            url = next_url  # type: ignore[assignment]
            params = {}  # params are embedded in next_url cursor

    return templates
