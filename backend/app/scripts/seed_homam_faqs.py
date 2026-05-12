#!/usr/bin/env python3
# backend/app/scripts/seed_homam_faqs.py
"""
One-off script: seed Guru Peyarchi Homam FAQs.
Run once: python -m app.scripts.seed_homam_faqs
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from app.db.supabase import get_supabase

HOMAM_FAQS = [
    {
        "question": "What is Guru Peyarchi Homam?",
        "answer": (
            "Guru Peyarchi Homam is a sacred Vedic ritual performed on the day Jupiter (Guru) "
            "transits to a new zodiac sign. It is believed to remove obstacles, bring prosperity, "
            "and bless devotees with wisdom. We perform the homam on your behalf at the temple."
        ),
        "keywords": ["homam", "peyarchi", "guru", "jupiter", "what is", "ritual", "pooja"],
    },
    {
        "question": "Do I need to be physically present?",
        "answer": (
            "No, physical presence is not required. We perform the homam on your behalf at the temple. "
            "You will receive a personal video proof of the pooja conducted for you, and prasadam "
            "will be sent to your delivery address."
        ),
        "keywords": ["present", "attend", "come", "physical", "in person", "temple"],
    },
    {
        "question": "What is the booking cost?",
        "answer": (
            "Please reply 'BOOK' or send a WhatsApp message to confirm your interest and our team "
            "will share the exact booking amount and payment details with you."
        ),
        "keywords": ["cost", "price", "fee", "amount", "how much", "charges", "rate"],
    },
    {
        "question": "When will I receive prasadam?",
        "answer": (
            "Prasadam will be dispatched within 3–5 business days after the homam date. "
            "It will be sent via courier to the address you provide during booking."
        ),
        "keywords": ["prasadam", "prasad", "delivery", "when", "dispatch", "courier", "send"],
    },
    {
        "question": "Will I get video proof?",
        "answer": (
            "Yes! We will send a personalised video of the homam performed specifically for you. "
            "The video includes your name being chanted during the ritual. It will be sent via "
            "WhatsApp within 24 hours of the pooja completion."
        ),
        "keywords": ["video", "proof", "recording", "watch", "see", "personal", "evidence"],
    },
    {
        "question": "How do I book?",
        "answer": (
            "Reply with 'BOOK' or 'YES' to get started. We will collect your name, Rasi (zodiac), "
            "Nakshatram (birth star), Gotram, and delivery address. Once confirmed, we will send "
            "you a secure payment link to complete your booking."
        ),
        "keywords": ["book", "booking", "register", "how to", "process", "steps", "enroll", "yes"],
    },
    {
        "question": "What details are needed for booking?",
        "answer": (
            "We need: (1) Your full name, (2) Rasi (zodiac sign), (3) Nakshatram (birth star), "
            "(4) Gotram, (5) Delivery address for prasadam. "
            "Reply 'BOOK' and we will guide you step by step."
        ),
        "keywords": ["details", "information", "rasi", "nakshatram", "gotram", "name", "address"],
    },
    {
        "question": "Is my payment secure?",
        "answer": (
            "Yes. We use a secure payment gateway. You will receive a unique payment link. "
            "Once payment is confirmed, you will get a booking confirmation message with your "
            "unique reference number."
        ),
        "keywords": ["payment", "pay", "safe", "secure", "online", "upi", "link"],
    },
]

def main():
    db = get_supabase()

    inserted = 0
    skipped = 0
    for faq in HOMAM_FAQS:
        # Check if a similar question already exists
        existing = (
            db.table("faqs")
            .select("id")
            .ilike("question", f"%{faq['question'][:30]}%")
            .execute()
        )
        if existing.data:
            print(f"  SKIP (exists): {faq['question'][:60]}")
            skipped += 1
            continue

        db.table("faqs").insert({
            "question": faq["question"],
            "answer": faq["answer"],
            "keywords": faq["keywords"],
            "active": True,
        }).execute()
        print(f"  INSERT: {faq['question'][:60]}")
        inserted += 1

    print(f"\nDone. Inserted: {inserted}, Skipped: {skipped}")


if __name__ == "__main__":
    main()
