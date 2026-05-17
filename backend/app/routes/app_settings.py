import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.config import settings as env_settings
from app.dependencies.tenant import get_tenant_id

logger = logging.getLogger(__name__)
router = APIRouter()


class SettingsUpdate(BaseModel):
    updates: dict[str, str | None]


@router.get("/")
async def list_settings(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("app_settings").select("*").eq("tenant_id", tenant_id).order("key").execute()
    rows = result.data or []
    settings = []
    _ENV_ATTRS = {
        "gemini_api_key": "gemini_api_key",
        "meta_access_token": "meta_access_token",
        "meta_phone_number_id": "meta_phone_number_id",
        "meta_waba_id": "meta_waba_id",
        "meta_webhook_verify_token": "meta_verify_token",
        "razorpay_key_id": "razorpay_key_id",
        "razorpay_key_secret": "razorpay_key_secret",
        "razorpay_webhook_secret": "razorpay_webhook_secret",
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
