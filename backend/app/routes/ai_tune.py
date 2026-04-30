import json
import logging
import re
from typing import Literal
import google.generativeai as genai
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.config import settings
from app.db.supabase import get_supabase
from app.dependencies.tenant import get_tenant_id
from app.services.ai_reply import invalidate_prompt_cache

logger = logging.getLogger(__name__)
router = APIRouter()

genai.configure(api_key=settings.gemini_api_key)
_tune_model = genai.GenerativeModel("gemini-2.5-pro")

META_PROMPT = """You are a prompt-engineering coach. Below is the current SYSTEM PROMPT
used by a WhatsApp AI assistant for an education consultancy, followed by transcripts of
CONVERSATIONS that successfully closed (student converted).

Analyse the winning tone, pacing, phrasing, and next-step hooks. Suggest 2 to 3 concrete,
SHORT additions or tweaks to the system prompt that would make new replies better mimic
the winning patterns. Do NOT rewrite the whole prompt. Each suggestion must be a standalone
sentence or short paragraph that can be appended to the existing prompt as-is.

Return STRICT JSON, no prose, no markdown fences:
[{"suggestion":"...","rationale":"..."}, ...]

=== CURRENT SYSTEM PROMPT ===
{prompt}

=== WINNING CONVERSATIONS ===
{conversations}
"""


class PromptUpdate(BaseModel):
    content: str


_DEFAULT_WHATSAPP_PROMPT = "You are a helpful AI assistant. Answer customer queries accurately and warmly. Keep replies concise (2-3 sentences). Always encourage the next step."


@router.get("/prompts")
async def list_prompts(tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    res = db.table("ai_prompts").select("*").eq("tenant_id", tenant_id).order("name").execute()
    if not res.data:
        db.table("ai_prompts").insert({
            "name": "whatsapp_reply",
            "content": _DEFAULT_WHATSAPP_PROMPT,
            "tenant_id": tenant_id,
        }).execute()
        res = db.table("ai_prompts").select("*").eq("tenant_id", tenant_id).order("name").execute()
    return {"data": res.data or []}


@router.put("/prompts/{name}")
async def update_prompt(name: str, payload: PromptUpdate, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    res = db.table("ai_prompts").update({"content": payload.content}).eq("name", name).eq("tenant_id", tenant_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail=f"Prompt '{name}' not found")
    invalidate_prompt_cache(name)
    return res.data[0]


@router.post("/analyze")
async def analyze(for_prompt: str = "whatsapp_reply", limit: int = 5, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()

    prompt_row = db.table("ai_prompts").select("content").eq("name", for_prompt).eq("tenant_id", tenant_id).maybe_single().execute()
    if not prompt_row.data:
        raise HTTPException(status_code=404, detail=f"Prompt '{for_prompt}' not found")
    active_prompt = prompt_row.data["content"]

    converted = (
        db.table("leads")
        .select("id,name,phone")
        .eq("tenant_id", tenant_id)
        .not_.is_("converted_at", "null")
        .order("converted_at", desc=True)
        .limit(limit)
        .execute()
    )
    lead_rows = converted.data or []
    if not lead_rows:
        raise HTTPException(status_code=400, detail="No converted leads to analyse. Mark at least one lead as converted first.")

    transcripts: list[str] = []
    for lead in lead_rows:
        msgs = (
            db.table("messages")
            .select("direction,content,created_at")
            .eq("lead_id", lead["id"])
            .eq("tenant_id", tenant_id)
            .order("created_at", desc=False)
            .limit(40)
            .execute()
        )
        lines = [f"{m['direction'].upper()}: {m['content']}" for m in (msgs.data or [])]
        if lines:
            header = f"--- Lead {lead.get('name') or lead.get('phone') or lead['id'][:8]} ---"
            transcripts.append(header + "\n" + "\n".join(lines))

    if not transcripts:
        raise HTTPException(status_code=400, detail="Converted leads have no message history.")

    meta = (
        META_PROMPT
        .replace("{prompt}", active_prompt)
        .replace("{conversations}", "\n\n".join(transcripts))
    )
    try:
        resp = _tune_model.generate_content([{"role": "user", "parts": [meta]}])
        text = (resp.text or "").strip()
    except Exception as e:
        logger.error(f"Gemini analyze failed: {e}")
        raise HTTPException(status_code=502, detail=f"Gemini call failed: {e}")

    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.MULTILINE).strip()
    try:
        items = json.loads(text)
        if not isinstance(items, list):
            raise ValueError("expected a JSON list")
    except Exception as e:
        logger.error(f"Failed to parse Gemini JSON: {e}\nText: {text[:500]}")
        raise HTTPException(status_code=502, detail=f"Gemini returned non-JSON: {text[:200]}")

    inserted: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        suggestion = str(it.get("suggestion", "")).strip()
        rationale = str(it.get("rationale", "")).strip() or None
        if not suggestion:
            continue
        row = db.table("ai_tune_suggestions").insert({
            "for_prompt": for_prompt,
            "suggestion": suggestion,
            "rationale": rationale,
            "tenant_id": tenant_id,
        }).execute()
        if row.data:
            inserted.append(row.data[0])

    return {"analyzed_leads": len(lead_rows), "suggestions_created": len(inserted), "data": inserted}


@router.get("/suggestions")
async def list_suggestions(status: Literal["pending", "applied", "rejected", "all"] = "pending", tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    query = db.table("ai_tune_suggestions").select("*").eq("tenant_id", tenant_id).order("created_at", desc=True).limit(100)
    if status != "all":
        query = query.eq("status", status)
    res = query.execute()
    return {"data": res.data or []}


@router.post("/suggestions/{suggestion_id}/apply")
async def apply_suggestion(suggestion_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    sug = db.table("ai_tune_suggestions").select("*").eq("id", suggestion_id).eq("tenant_id", tenant_id).maybe_single().execute()
    if not sug.data:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if sug.data["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Suggestion already {sug.data['status']}")

    name = sug.data["for_prompt"]
    prompt_row = db.table("ai_prompts").select("content").eq("name", name).eq("tenant_id", tenant_id).maybe_single().execute()
    if not prompt_row.data:
        raise HTTPException(status_code=404, detail=f"Prompt '{name}' not found")

    new_content = prompt_row.data["content"].rstrip() + "\n\n" + sug.data["suggestion"].strip() + "\n"
    db.table("ai_prompts").update({"content": new_content}).eq("name", name).eq("tenant_id", tenant_id).execute()
    db.table("ai_tune_suggestions").update({"status": "applied"}).eq("id", suggestion_id).eq("tenant_id", tenant_id).execute()
    invalidate_prompt_cache(name)
    return {"applied": True, "for_prompt": name, "new_length": len(new_content)}


@router.post("/suggestions/{suggestion_id}/reject")
async def reject_suggestion(suggestion_id: str, tenant_id: str = Depends(get_tenant_id)):
    db = get_supabase()
    res = db.table("ai_tune_suggestions").update({"status": "rejected"}).eq("id", suggestion_id).eq("tenant_id", tenant_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return {"rejected": True}
