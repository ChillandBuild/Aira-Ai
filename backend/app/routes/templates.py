import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.meta_cloud import submit_template, get_template_status
from app.config_dynamic import get_setting

logger = logging.getLogger(__name__)
router = APIRouter()
public_router = APIRouter()  # No auth — Meta calls these endpoints directly


class CreateTemplate(BaseModel):
    name: str
    category: str
    language: str = "en"
    body_text: str
    header_text: str | None = None
    footer_text: str | None = None
    buttons: list[str] | None = None  # Optional quick reply button labels


@router.get("/")
async def list_templates(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    result = db.table("message_templates").select("*").eq("tenant_id", tenant_id).order("submitted_at", desc=True).execute()
    return {"data": result.data or []}


@router.post("/")
async def create_template(payload: CreateTemplate, tenant_id: str = Depends(get_tenant_id)):
    name = payload.name.strip().lower().replace(" ", "_")
    category = payload.category.upper()
    if category not in ("MARKETING", "UTILITY", "AUTHENTICATION"):
        raise HTTPException(status_code=400, detail="Invalid category")

    waba_id = get_setting("meta_waba_id", tenant_id=tenant_id)

    db = get_supabase()
    existing = db.table("message_templates").select("id").eq("name", name).eq("tenant_id", tenant_id).limit(1).execute()
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
                body_text=payload.body_text,
                header_text=payload.header_text,
                footer_text=payload.footer_text,
                buttons=payload.buttons or None,
                tenant_id=tenant_id,
            )
            meta_template_id = str(meta_response.get("id", ""))
        except Exception as e:
            logger.warning(f"Meta template submission failed for {name}: {e}, saved as PENDING")
    else:
        logger.info(f"No meta_waba_id configured — saving template '{name}' locally as PENDING")

    result = db.table("message_templates").insert({
        "name": name,
        "category": category,
        "language": payload.language,
        "body_text": payload.body_text,
        "status": status,
        "meta_template_id": meta_template_id,
        "tenant_id": tenant_id,
    }).execute()

    return result.data[0]


@router.delete("/{template_id}")
async def delete_template(template_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    db.table("message_templates").delete().eq("id", template_id).eq("tenant_id", tenant_id).execute()
    return {"deleted": True}


@router.post("/{template_id}/sync")
async def sync_template_status(template_id: str, tenant_id: str = Depends(get_tenant_id)):
    """Pull current status from Meta API and update the local record."""
    db = get_supabase()
    row = db.table("message_templates").select("name,meta_template_id").eq("id", template_id).eq("tenant_id", tenant_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Template not found")

    waba_id = get_setting("meta_waba_id", tenant_id=tenant_id)
    if not waba_id:
        raise HTTPException(status_code=400, detail="meta_waba_id not configured in Settings")

    meta_info = await get_template_status(waba_id=waba_id, template_name=row.data[0]["name"], tenant_id=tenant_id)
    if not meta_info:
        raise HTTPException(status_code=502, detail="Template not found on Meta — check WABA ID and access token in Settings")

    new_status = meta_info.get("status", "PENDING").upper()
    updates: dict = {"status": new_status}
    if new_status == "APPROVED":
        updates["approved_at"] = datetime.now(timezone.utc).isoformat()
    if meta_info.get("rejected_reason"):
        updates["rejection_reason"] = meta_info["rejected_reason"]

    db.table("message_templates").update(updates).eq("id", template_id).execute()
    updated = db.table("message_templates").select("*").eq("id", template_id).limit(1).execute()
    return updated.data[0] if updated.data else None


@public_router.post("/webhook-status")
async def template_status_webhook(payload: dict):
    """Meta calls this when template status changes (APPROVED/REJECTED). No auth."""
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
                updates["approved_at"] = datetime.now(timezone.utc).isoformat()
            db.table("message_templates").update(updates).eq("meta_template_id", meta_id).execute()
            logger.info(f"Template {meta_id} status → {new_status}")
    return {"status": "ok"}
