import logging
from uuid import UUID
import mimetypes
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from pydantic import BaseModel, Field
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.meta_cloud import upload_media_to_meta, get_wa_type_for_mime
from app.routes.media import _ALLOWED_MIME_TYPES, _TYPE_LIMITS, _MAX_DOCUMENT_BYTES

logger = logging.getLogger(__name__)
router = APIRouter()


class FAQCreate(BaseModel):
    question: str = Field(..., min_length=2)
    answer: str = Field(..., min_length=2)
    keywords: list[str] = Field(default_factory=list)
    active: bool = True


class FAQUpdate(BaseModel):
    question: str | None = None
    answer: str | None = None
    keywords: list[str] | None = None
    active: bool | None = None


def _clean_keywords(kws: list[str] | None) -> list[str]:
    if not kws:
        return []
    seen: list[str] = []
    for k in kws:
        k = (k or "").strip().lower()
        if k and k not in seen:
            seen.append(k)
    return seen


@router.get("/faqs")
async def list_faqs(active_only: bool = False, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    query = db.table("faqs").select("*").eq("tenant_id", tenant_id).order("hit_count", desc=True).order("created_at", desc=True)
    if active_only:
        query = query.eq("active", True)
    res = query.execute()
    return {"data": res.data or []}


@router.post("/faqs")
async def create_faq(payload: FAQCreate, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    row = {
        "question": payload.question.strip(),
        "answer": payload.answer.strip(),
        "keywords": _clean_keywords(payload.keywords),
        "active": payload.active,
        "tenant_id": tenant_id,
    }
    res = db.table("faqs").insert(row).execute()
    return res.data[0] if res.data else row


@router.patch("/faqs/{faq_id}")
async def update_faq(faq_id: UUID, payload: FAQUpdate, tenant_id: str = Depends(get_tenant_id)):
    update: dict = {}
    if payload.question is not None:
        update["question"] = payload.question.strip()
    if payload.answer is not None:
        update["answer"] = payload.answer.strip()
    if payload.keywords is not None:
        update["keywords"] = _clean_keywords(payload.keywords)
    if payload.active is not None:
        update["active"] = payload.active
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    db = get_supabase()
    res = db.table("faqs").update(update).eq("id", str(faq_id)).eq("tenant_id", tenant_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="FAQ not found")
    return res.data[0]


@router.delete("/faqs/{faq_id}")
async def delete_faq(faq_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    db.table("faqs").delete().eq("id", str(faq_id)).eq("tenant_id", tenant_id).execute()
    return {"success": True}


@router.post("/faqs/{faq_id}/media")
async def upload_faq_media(
    faq_id: UUID,
    file: UploadFile = File(...),
    tenant_id: str = Depends(get_tenant_id)
):
    db = get_supabase()
    faq = db.table("faqs").select("*").eq("id", str(faq_id)).eq("tenant_id", tenant_id).maybe_single().execute()
    if not faq.data:
        raise HTTPException(status_code=404, detail="FAQ not found")

    filename = file.filename or "upload"
    mime_type = file.content_type or ""
    if not mime_type:
        guessed, _ = mimetypes.guess_type(filename)
        mime_type = guessed or "application/octet-stream"

    mime_type = mime_type.lower().split(";")[0].strip()

    if mime_type not in _ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{mime_type}'."
        )

    wa_type = get_wa_type_for_mime(mime_type)

    file_bytes = await file.read()
    file_size = len(file_bytes)
    size_limit = _TYPE_LIMITS.get(wa_type, _MAX_DOCUMENT_BYTES)
    if file_size > size_limit:
        raise HTTPException(status_code=413, detail=f"File too large. Limit is {round(size_limit / 1024 / 1024)} MB.")
    if file_size == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    logger.info(f"Uploading media for FAQ {faq_id} (tenant {tenant_id}): {filename} ({mime_type})")
    try:
        media_id = await upload_media_to_meta(
            file_bytes=file_bytes,
            mime_type=mime_type,
            filename=filename,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Media upload to Meta failed: %s", e)
        raise HTTPException(status_code=502, detail=f"Media upload failed: {e}")

    # Update the FAQ with the media details
    update_data = {
        "media_id": media_id,
        "media_url": f"meta:{media_id}",
        "media_type": wa_type,
        "media_filename": filename,
        "media_mime_type": mime_type,
    }
    
    logger.info(f"Updating FAQ {faq_id} with data: {update_data}")
    res = db.table("faqs").update(update_data).eq("id", str(faq_id)).eq("tenant_id", tenant_id).execute()
    
    if not res.data:
        logger.error(f"Failed to update FAQ {faq_id}. No rows matched for tenant {tenant_id}.")
        # Fallback check: does the FAQ exist for this tenant?
        exists = db.table("faqs").select("id").eq("id", str(faq_id)).eq("tenant_id", tenant_id).execute()
        logger.error(f"Verification - FAQ exists for tenant {tenant_id}: {bool(exists.data)}")
    else:
        logger.info(f"FAQ {faq_id} updated successfully with media.")

    return res.data[0] if res.data else {**update_data, "id": str(faq_id)}


@router.delete("/faqs/{faq_id}/media")
async def delete_faq_media(faq_id: UUID, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    faq = db.table("faqs").select("*").eq("id", str(faq_id)).eq("tenant_id", tenant_id).maybe_single().execute()
    if not faq.data:
        raise HTTPException(status_code=404, detail="FAQ not found")
        
    update_data = {
        "media_id": None,
        "media_url": None,
        "media_type": None,
        "media_filename": None,
        "media_mime_type": None,
    }
    res = db.table("faqs").update(update_data).eq("id", str(faq_id)).eq("tenant_id", tenant_id).execute()
    return res.data[0] if res.data else update_data

