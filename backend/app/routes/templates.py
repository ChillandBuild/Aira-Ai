import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.meta_cloud import submit_template
from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateTemplate(BaseModel):
    name: str
    category: str
    language: str = "en"
    components: list


@router.get("/")
async def list_templates(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("meta_templates").select("*").eq("tenant_id", tenant_id).order("created_at", desc=True).execute()
    return {"data": result.data or []}


@router.post("/")
async def create_template(payload: CreateTemplate, tenant_id: str = Depends(get_tenant_id)):
    name = payload.name.strip().lower().replace(" ", "_")
    category = payload.category.upper()
    if category not in ("MARKETING", "UTILITY", "AUTHENTICATION"):
        raise HTTPException(status_code=400, detail="Invalid category")

    waba_id = get_setting("meta_phone_number_id")

    db = get_supabase()
    existing = db.table("meta_templates").select("id").eq("name", name).eq("tenant_id", tenant_id).maybe_single().execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"Template '{name}' already exists")

    meta_template_id = None
    status = "PENDING"
    if waba_id:
        try:
            meta_response = await submit_template(
                waba_id=waba_id,
                name=name,
                category=category,
                language=payload.language,
                components=payload.components,
            )
            meta_template_id = str(meta_response.get("id", ""))
        except Exception:
            logger.warning(f"Meta template submission failed for {name}, saved as PENDING")
    else:
        logger.info(f"No WABA ID configured — saving template '{name}' locally as PENDING")

    result = db.table("meta_templates").insert({
        "name": name,
        "category": category,
        "language": payload.language,
        "components": payload.components,
        "status": status,
        "meta_template_id": meta_template_id,
        "tenant_id": tenant_id,
    }).execute()

    return result.data[0]


@router.delete("/{template_id}")
async def delete_template(template_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    db.table("meta_templates").delete().eq("id", template_id).eq("tenant_id", tenant_id).execute()
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
            db.table("meta_templates").update(updates).eq("meta_template_id", meta_id).execute()
            logger.info(f"Template {meta_id} status → {new_status}")
    return {"status": "ok"}
