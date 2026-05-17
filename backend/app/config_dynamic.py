import os
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_CACHE: dict[str, tuple[float, Optional[str]]] = {}
_TTL = 60.0
_DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001"

_ENV_MAP = {
    "meta_access_token": "META_ACCESS_TOKEN",
    "meta_phone_number_id": "META_PHONE_NUMBER_ID",
    "meta_waba_id": "META_WABA_ID",
    "meta_webhook_verify_token": "META_WEBHOOK_VERIFY_TOKEN",
    "telecmi_user_id": "TELECMI_USER_ID",
    "telecmi_secret": "TELECMI_SECRET",
    "telecmi_callerid": "TELECMI_CALLERID",
    "telecmi_recording_base_url": "TELECMI_RECORDING_BASE_URL",
    "gemini_api_key": "GEMINI_API_KEY",
    "razorpay_key_id": "RAZORPAY_KEY_ID",
    "razorpay_key_secret": "RAZORPAY_KEY_SECRET",
    "razorpay_webhook_secret": "RAZORPAY_WEBHOOK_SECRET",
    "ai_auto_reply_enabled": "AI_AUTO_REPLY_ENABLED",
    "faq_match_threshold": "FAQ_MATCH_THRESHOLD",
}


def get_setting(key: str, fallback: Optional[str] = None, tenant_id: Optional[str] = None) -> Optional[str]:
    """Read from cache → app_settings table → env var → fallback."""
    now = time.monotonic()
    resolved_tenant_id = tenant_id or _DEFAULT_TENANT_ID
    cache_key = f"{resolved_tenant_id}:{key}"
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _TTL:
        return cached[1]

    value: Optional[str] = None
    try:
        from app.db.supabase import get_supabase
        db = get_supabase()
        row = (
            db.table("app_settings")
            .select("value")
            .eq("tenant_id", resolved_tenant_id)
            .eq("key", key)
            .maybe_single()
            .execute()
        )
        if row and row.data:
            value = row.data.get("value")
    except Exception as e:
        logger.warning(f"get_setting({key}, tenant_id={resolved_tenant_id}) DB read failed: {e}")

    if not value:
        value = os.environ.get(_ENV_MAP.get(key, key.upper()))

    if not value:
        value = fallback

    _CACHE[cache_key] = (now, value)
    return value


def invalidate_cache(key: Optional[str] = None) -> None:
    if key:
        keys_to_remove = [cache_key for cache_key in _CACHE if cache_key.endswith(f":{key}")]
        for cache_key in keys_to_remove:
            _CACHE.pop(cache_key, None)
    else:
        _CACHE.clear()
