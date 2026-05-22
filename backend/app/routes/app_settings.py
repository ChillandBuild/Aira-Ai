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


class SettingsUpdate(BaseModel):
    updates: dict[str, str | None]


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
    _ENV_ATTRS = {
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
