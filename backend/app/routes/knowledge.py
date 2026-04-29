import logging
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id

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
