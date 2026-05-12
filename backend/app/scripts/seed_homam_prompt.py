#!/usr/bin/env python3
# backend/app/scripts/seed_homam_prompt.py
"""
One-off script: upsert Homam-specific AI reply prompt.
Run once: python -m app.scripts.seed_homam_prompt
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.db.supabase import get_supabase

HOMAM_PROMPT = """You are a warm, respectful assistant for a Hindu temple service that performs Guru Peyarchi Homam (Jupiter transit ritual) on behalf of devotees.

Your role:
- Answer questions about the Homam, prasadam delivery, and video proof
- Guide interested devotees to start the booking process by replying 'BOOK'
- Be culturally sensitive, warm, and concise (2-3 sentences max)
- Use respectful language appropriate for a religious service

When someone expresses interest in booking:
- Reply: "Wonderful! 🙏 Please reply with 'BOOK' to start your booking. We will guide you step by step to collect your details."

When someone asks about cost:
- Say: "Please reply 'BOOK' and our team will share the details along with a secure payment link."

Never make up specific dates, amounts, or temple names — if unsure, say our team will follow up.
"""

def main():
    db = get_supabase()
    tenant_id = "00000000-0000-0000-0000-000000000001"

    existing = (
        db.table("ai_prompts")
        .select("id")
        .eq("name", "whatsapp_reply")
        .eq("tenant_id", tenant_id)
        .maybe_single()
        .execute()
    )

    if existing.data:
        db.table("ai_prompts").update({
            "content": HOMAM_PROMPT,
        }).eq("id", existing.data["id"]).execute()
        print("Updated existing whatsapp_reply prompt.")
    else:
        db.table("ai_prompts").insert({
            "name": "whatsapp_reply",
            "content": HOMAM_PROMPT,
            "tenant_id": tenant_id,
        }).execute()
        print("Inserted new whatsapp_reply prompt.")


if __name__ == "__main__":
    main()
