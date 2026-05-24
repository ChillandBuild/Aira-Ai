import logging
import secrets
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.config import settings as env_settings
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()

_ENV_ATTRS: dict[str, str] = {
    "meta_access_token": "meta_access_token",
    "meta_phone_number_id": "meta_phone_number_id",
    "meta_waba_id": "meta_waba_id",
    "meta_webhook_verify_token": "meta_verify_token",
    "razorpay_key_id": "razorpay_key_id",
    "razorpay_key_secret": "razorpay_key_secret",
    "razorpay_webhook_secret": "razorpay_webhook_secret",
    "telecmi_user_id": "telecmi_user_id",
    "telecmi_secret": "telecmi_secret",
    "telecmi_callerid": "telecmi_callerid",
    "telecmi_recording_base_url": "telecmi_recording_base_url",
    "groq_api_key": "groq_api_key",
    "telegram_bot_token": "telegram_bot_token",
    "instagram_access_token": "instagram_access_token",
    "instagram_page_id": "instagram_page_id",
    "facebook_access_token": "facebook_access_token",
    "facebook_page_id": "facebook_page_id",
    "meta_app_secret": "meta_app_secret",
}


class SettingsUpdate(BaseModel):
    updates: dict[str, str | None]


class ActivateChannelRequest(BaseModel):
    channel: str  # whatsapp | instagram | facebook


def _get_setting_value(db, tenant_id: str, key: str) -> str | None:
    row = (
        db.table("app_settings")
        .select("value")
        .eq("tenant_id", tenant_id)
        .eq("key", key)
        .maybe_single()
        .execute()
    )
    db_val = row.data["value"] if row and row.data else None
    attr = _ENV_ATTRS.get(key)
    env_val = getattr(env_settings, attr, None) if attr else None
    return db_val or env_val


async def setup_telegram_webhook(bot_token: str, tenant_id: str) -> tuple[bool, str | None]:
    """Register Telegram webhook + return generated secret (None if base_url missing)."""
    from app.config_dynamic import get_setting
    base_url = get_setting("public_base_url") or env_settings.public_base_url
    if not base_url:
        logger.warning("public_base_url not set — cannot register Telegram webhook")
        return True, None
    webhook_url = f"{base_url.rstrip('/')}/webhook/telegram/{tenant_id}"
    secret_token = secrets.token_urlsafe(32)
    try:
        url = f"https://api.telegram.org/bot{bot_token}/setWebhook"
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                url,
                json={"url": webhook_url, "secret_token": secret_token},
                timeout=10.0,
            )
            resp.raise_for_status()
            logger.info(f"Telegram webhook set to {webhook_url} for tenant {tenant_id}")
            return True, secret_token
    except Exception as e:
        logger.error(f"Failed to set Telegram webhook: {e}")
        return False, None


@router.get("/")
async def list_settings(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("app_settings").select("*").eq("tenant_id", tenant_id).order("key").execute()
    rows = result.data or []
    settings = []
    for row in rows:
        db_value = row["value"]
        attr = _ENV_ATTRS.get(row["key"])
        env_value = getattr(env_settings, attr, None) if attr else None
        effective_value = db_value or env_value
        is_set = effective_value is not None
        source = "db" if db_value else ("env" if env_value else None)
        if row["is_secret"] and is_set and effective_value:
            v = str(effective_value)
            if len(v) > 12:
                display_value = f"{v[:4]}{'•' * 8}{v[-4:]}"
            else:
                display_value = "•" * len(v)
        else:
            display_value = effective_value or "Not set"
        settings.append({
            "key": row["key"],
            "display_value": display_value,
            "is_secret": row["is_secret"],
            "is_set": is_set,
            "source": source,
            "updated_at": row["updated_at"],
        })
    return {"settings": settings}


@router.patch("/")
async def update_settings(payload: SettingsUpdate, tenant_id: str = Depends(get_tenant_id)):
    if not payload.updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    db = get_supabase()

    if "telegram_bot_token" in payload.updates:
        tg_token = payload.updates["telegram_bot_token"]
        if tg_token:
            tg_token = tg_token.strip()
            payload.updates["telegram_bot_token"] = tg_token
            success, secret_token = await setup_telegram_webhook(tg_token, tenant_id)
            if not success:
                raise HTTPException(
                    status_code=400,
                    detail="Failed to set Telegram webhook. Please verify your Bot Token is correct."
                )
            if secret_token:
                # Persist webhook secret so the route can validate inbound updates
                existing = (
                    db.table("app_settings")
                    .select("id")
                    .eq("tenant_id", tenant_id)
                    .eq("key", "telegram_webhook_secret")
                    .maybe_single()
                    .execute()
                )
                if existing and existing.data:
                    db.table("app_settings").update(
                        {"value": secret_token, "updated_at": "now()"}
                    ).eq("tenant_id", tenant_id).eq("key", "telegram_webhook_secret").execute()
                else:
                    db.table("app_settings").insert({
                        "tenant_id": tenant_id,
                        "key": "telegram_webhook_secret",
                        "value": secret_token,
                        "is_secret": True,
                    }).execute()

    updated = []
    for key, value in payload.updates.items():
        result = (
            db.table("app_settings")
            .update({"value": value, "updated_at": "now()"})
            .eq("key", key)
            .eq("tenant_id", tenant_id)
            .execute()
        )
        if result.data:
            updated.append(key)
    from app.config_dynamic import invalidate_cache
    invalidate_cache()
    return {"updated": updated}


@router.post("/activate")
async def activate_channel(payload: ActivateChannelRequest, tenant_id: str = Depends(get_tenant_id)):
    """Validate Meta credentials and auto-subscribe webhook for whatsapp / instagram / facebook."""
    channel = payload.channel
    if channel not in ("whatsapp", "instagram", "facebook"):
        raise HTTPException(status_code=400, detail="Invalid channel. Must be whatsapp, instagram, or facebook.")

    db = get_supabase()

    if channel == "whatsapp":
        token = _get_setting_value(db, tenant_id, "meta_access_token")
        phone_id = _get_setting_value(db, tenant_id, "meta_phone_number_id")
        waba_id = _get_setting_value(db, tenant_id, "meta_waba_id")
        if not token or not phone_id:
            raise HTTPException(status_code=400, detail="Save meta_access_token and meta_phone_number_id first.")

        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"https://graph.facebook.com/v21.0/{phone_id}",
                params={"fields": "display_phone_number,verified_name", "access_token": token},
                timeout=10.0,
            )
        data = r.json()
        if "error" in data:
            raise HTTPException(status_code=400, detail=data["error"].get("message", "Invalid credentials"))

        subscribed = False
        if waba_id:
            async with httpx.AsyncClient() as client:
                sub_r = await client.post(
                    f"https://graph.facebook.com/v21.0/{waba_id}/subscribed_apps",
                    params={"access_token": token},
                    timeout=10.0,
                )
            sub_data = sub_r.json()
            subscribed = sub_data.get("success", False)
            if "error" in sub_data:
                logger.warning(f"WA subscribed_apps failed for tenant {tenant_id}: {sub_data['error']}")

        logger.info(f"WhatsApp activated tenant={tenant_id} phone={data.get('display_phone_number')} subscribed={subscribed}")
        return {
            "channel": "whatsapp",
            "phone_number": data.get("display_phone_number"),
            "business_name": data.get("verified_name"),
            "subscribed": subscribed,
        }

    # instagram or facebook
    token_key = f"{channel}_access_token"
    page_id_key = f"{channel}_page_id"
    token = _get_setting_value(db, tenant_id, token_key)
    page_id = _get_setting_value(db, tenant_id, page_id_key)
    if not token or not page_id:
        raise HTTPException(status_code=400, detail=f"Save {token_key} and {page_id_key} first.")

    async with httpx.AsyncClient() as client:
        r = await client.get(
            "https://graph.facebook.com/v21.0/me",
            params={"fields": "name,id", "access_token": token},
            timeout=10.0,
        )
    data = r.json()
    if "error" in data:
        raise HTTPException(status_code=400, detail=data["error"].get("message", "Invalid credentials"))

    sub_fields = "messages,messaging_postbacks,message_deliveries,message_reads"
    async with httpx.AsyncClient() as client:
        sub_r = await client.post(
            f"https://graph.facebook.com/v21.0/{page_id}/subscribed_apps",
            params={"subscribed_fields": sub_fields, "access_token": token},
            timeout=10.0,
        )
    sub_data = sub_r.json()
    subscribed = sub_data.get("success", False)
    if "error" in sub_data:
        logger.warning(f"{channel} subscribed_apps failed tenant={tenant_id}: {sub_data['error']}")

    logger.info(f"{channel} activated tenant={tenant_id} page={data.get('name')} subscribed={subscribed}")
    return {
        "channel": channel,
        "page_name": data.get("name"),
        "page_id": data.get("id"),
        "subscribed": subscribed,
    }
