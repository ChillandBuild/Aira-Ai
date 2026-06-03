import logging
import secrets
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.db.supabase import get_supabase
from app.dependencies.auth import get_current_user
from app.dependencies.system_admin import get_system_admin

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/me")
def operator_me(user: dict = Depends(get_current_user)):
    """Verify the caller is a system admin. No tenant required."""
    db = get_supabase()
    result = (
        db.table("system_admins")
        .select("user_id")
        .eq("user_id", user["user_id"])
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=403, detail="Access denied.")
    return {"is_system_admin": True, "user_id": user["user_id"]}

ServiceTier = Literal[
    "whatsapp_only", "telecalling_only", "combined",
    "whatsapp_instagram", "whatsapp_facebook", "whatsapp_telegram",
    "omnichannel", "omnichannel_telecalling",
]

_FEATURE_MAP: dict[str, list[str]] = {
    "whatsapp_only":         ["whatsapp"],
    "telecalling_only":      ["telecalling"],
    "combined":              ["whatsapp", "telecalling"],
    "whatsapp_instagram":    ["whatsapp", "instagram"],
    "whatsapp_facebook":     ["whatsapp", "facebook"],
    "whatsapp_telegram":     ["whatsapp", "telegram"],
    "omnichannel":           ["whatsapp", "instagram", "facebook", "telegram"],
    "omnichannel_telecalling": ["whatsapp", "instagram", "facebook", "telegram", "telecalling"],
}

_SETTING_KEYS: list[tuple[str, bool]] = [
    ("meta_phone_number_id", False), ("meta_access_token", True),
    ("meta_waba_id", False), ("meta_webhook_verify_token", True),
    ("telecmi_user_id", False), ("telecmi_secret", True),
    ("telecmi_callerid", False), ("telecmi_recording_base_url", False),
    ("groq_api_key", True),
    ("ai_auto_reply_enabled", False), ("bot_auto_reply_enabled", False), ("faq_match_threshold", False),
    ("razorpay_key_id", False), ("razorpay_key_secret", True),
    ("razorpay_webhook_secret", True),
]


class CreateClientPayload(BaseModel):
    company_name: str
    email: EmailStr
    password: str
    service: ServiceTier = "combined"


class UpdateFeaturesPayload(BaseModel):
    service: ServiceTier


class UpdateStatusPayload(BaseModel):
    status: Literal["active", "suspended"]


@router.get("/clients")
def list_clients(_admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    tenants = (
        db.table("tenants")
        .select("id, name, enabled_features, status, created_at")
        .order("created_at", desc=True)
        .execute()
    )
    tenant_ids = [t["id"] for t in (tenants.data or [])]
    owners_map: dict[str, str] = {}
    if tenant_ids:
        owners_rows = (
            db.table("tenant_users")
            .select("tenant_id, user_id")
            .in_("tenant_id", tenant_ids)
            .eq("role", "owner")
            .execute()
        )
        owners_map = {r["tenant_id"]: r["user_id"] for r in (owners_rows.data or [])}
    result = [{**t, "owner_user_id": owners_map.get(t["id"])} for t in (tenants.data or [])]
    return {"data": result}


@router.post("/clients", status_code=201)
async def create_client(payload: CreateClientPayload, _admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    features = _FEATURE_MAP[payload.service]

    try:
        result = db.auth.admin.create_user({
            "email": payload.email,
            "password": payload.password,
            "email_confirm": True,
        })
        user = result.user
        new_user_id = user.id if hasattr(user, "id") else user["id"]
    except Exception as e:
        msg = str(e)
        if "already" in msg.lower() or "duplicate" in msg.lower():
            raise HTTPException(status_code=400, detail="A user with this email already exists")
        raise HTTPException(status_code=400, detail=f"Failed to create user: {msg}")

    try:
        tenant_result = db.table("tenants").insert({
            "name": payload.company_name,
            "enabled_features": features,
            "status": "active",
        }).execute()
        tenant_id = tenant_result.data[0]["id"]

        db.table("app_settings").insert([
            {"tenant_id": tenant_id, "key": k, "value": None, "is_secret": s}
            for k, s in _SETTING_KEYS
        ]).execute()

        db.table("tenant_users").insert({
            "tenant_id": tenant_id,
            "user_id": new_user_id,
            "role": "owner",
        }).execute()

        db.table("callers").insert({
            "tenant_id": tenant_id,
            "user_id": new_user_id,
            "name": "Admin",
            "active": True,
            "overall_score": 7.0,
        }).execute()
    except Exception as e:
        logger.error(f"Tenant setup failed for new user {new_user_id}, cleaning up: {e}")
        try:
            db.auth.admin.delete_user(new_user_id)
        except Exception as cleanup_err:
            logger.error(f"Failed to delete orphaned auth user {new_user_id}: {cleanup_err}")
        raise HTTPException(status_code=500, detail="Client setup failed; user account cleaned up.")

    logger.info(f"Operator created client: {payload.company_name} ({tenant_id}), service={payload.service}")
    return {
        "tenant_id": tenant_id,
        "company_name": payload.company_name,
        "email": payload.email,
        "service": payload.service,
        "enabled_features": features,
    }


@router.patch("/clients/{tenant_id}/features")
def update_features(tenant_id: str, payload: UpdateFeaturesPayload, _admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    features = _FEATURE_MAP[payload.service]
    result = db.table("tenants").update({"enabled_features": features}).eq("id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"tenant_id": tenant_id, "enabled_features": features}


@router.patch("/clients/{tenant_id}/status")
def update_status(tenant_id: str, payload: UpdateStatusPayload, _admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    result = db.table("tenants").update({"status": payload.status}).eq("id", tenant_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return {"tenant_id": tenant_id, "status": payload.status}


@router.post("/clients/{tenant_id}/wipe-leads")
def wipe_leads(tenant_id: str, _admin: dict = Depends(get_system_admin)):
    """Delete all leads and lead-related data for a tenant. Irreversible."""
    db = get_supabase()
    tenant = db.table("tenants").select("id,name").eq("id", tenant_id).maybe_single().execute()
    if not tenant.data:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Clear dependent tables first (tenant-scoped) to avoid FK violations
    for table in (
        "messages", "lead_notes", "hot_lead_alerts", "chat_handovers",
        "follow_up_jobs", "bookings",
        # Broadcast history — fully wiped per operator request
        "broadcast_recipients", "broadcast_lead_scores",
        "broadcast_failed_contacts", "broadcast_tags", "scheduled_broadcasts",
    ):
        try:
            db.table(table).delete().eq("tenant_id", tenant_id).execute()
        except Exception as e:
            logger.warning("wipe-leads: could not clear %s for tenant %s: %s", table, tenant_id, e)

    result = db.table("leads").delete().eq("tenant_id", tenant_id).execute()
    deleted = len(result.data or [])
    logger.warning("OPERATOR WIPE: %d leads deleted for tenant %s (%s)", deleted, tenant_id, tenant.data["name"])
    return {"deleted": deleted, "tenant_id": tenant_id}


@router.post("/clients/{tenant_id}/reset-password")
async def reset_password(tenant_id: str, _admin: dict = Depends(get_system_admin)):
    db = get_supabase()
    owner = (
        db.table("tenant_users")
        .select("user_id")
        .eq("tenant_id", tenant_id)
        .eq("role", "owner")
        .maybe_single()
        .execute()
    )
    if not owner.data:
        raise HTTPException(status_code=404, detail="No owner found for this tenant")
    temp_pw = "Aira@" + secrets.token_urlsafe(10)
    db.auth.admin.update_user_by_id(owner.data["user_id"], {"password": temp_pw})
    return {"temp_password": temp_pw}
