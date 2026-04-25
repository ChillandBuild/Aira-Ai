from fastapi import APIRouter
from app.config import settings
from app.db.supabase import get_supabase

router = APIRouter()


@router.get("/status")
async def status():
    db = get_supabase()

    prompt_row = (
        db.table("ai_prompts")
        .select("name,updated_at")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    active_prompt = prompt_row.data[0] if prompt_row.data else None

    faq_row = db.table("faqs").select("id", count="exact").eq("active", True).execute()

    return {
        "twilio_number": settings.twilio_whatsapp_number or None,
        "exotel_virtual_number": settings.exotel_virtual_number or None,
        "has_meta": bool(settings.meta_page_token),
        "has_gemini": bool(settings.gemini_api_key),
        "supabase_url": settings.supabase_url,
        "active_prompt": active_prompt,
        "active_faq_count": faq_row.count or 0,
    }
