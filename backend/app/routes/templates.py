import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.services.meta_cloud import submit_template
from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateTemplate(BaseModel):
    name: str
    category: str
    language: str = "en"
    body_text: str


@router.get("/")
async def list_templates():
    db = get_supabase()
    result = db.table("message_templates").select("*").order("submitted_at", desc=True).execute()
    return {"data": result.data or []}


@router.post("/")
async def create_template(payload: CreateTemplate):
    name = payload.name.strip().lower().replace(" ", "_")
    category = payload.category.upper()
    if category not in ("MARKETING", "UTILITY", "AUTHENTICATION"):
        raise HTTPException(status_code=400, detail="Invalid category")

    waba_id = get_setting("meta_phone_number_id")
    if not waba_id:
        raise HTTPException(status_code=400, detail="Meta Phone Number ID not configured in Settings")

    db = get_supabase()
    existing = db.table("message_templates").select("id").eq("name", name).maybe_single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"Template '{name}' already exists")

    meta_response = {}
    meta_template_id = None
    status = "PENDING"
    try:
        meta_response = await submit_template(
            waba_id=waba_id,
            name=name,
            category=category,
            language=payload.language,
            body_text=payload.body_text,
        )
        meta_template_id = str(meta_response.get("id", ""))
    except HTTPException:
        status = "PENDING"
        logger.warning(f"Meta template submission failed for {name}, saved as PENDING")

    result = db.table("message_templates").insert({
        "name": name,
        "category": category,
        "language": payload.language,
        "body_text": payload.body_text,
        "status": status,
        "meta_template_id": meta_template_id,
    }).execute()

    return result.data[0]


@router.delete("/{template_id}")
async def delete_template(template_id: str):
    db = get_supabase()
    db.table("message_templates").delete().eq("id", template_id).execute()
    return {"deleted": True}


@router.post("/webhook-status")
async def template_status_webhook(payload: dict):
    """Meta calls this when template status changes (APPROVED/REJECTED)."""
    entry = payload.get("entry", [])
    for e in entry:
        for change in e.get("changes", []):
            value = change.get("value", {})
            if change.get("field") != "message_template_status_update":
                continue
            meta_id = str(value.get("message_template_id", ""))
            new_status = value.get("event", "").upper()
            reason = value.get("reason")
            if not meta_id or new_status not in ("APPROVED", "REJECTED", "PAUSED"):
                continue
            db = get_supabase()
            updates: dict = {"status": new_status}
            if reason:
                updates["rejection_reason"] = reason
            if new_status == "APPROVED":
                updates["approved_at"] = "now()"
            db.table("message_templates").update(updates).eq("meta_template_id", meta_id).execute()
            logger.info(f"Template {meta_id} status → {new_status}")
    return {"status": "ok"}
