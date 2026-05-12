# Guru Peyarchi Homam — V1 Campaign Ready Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Aira AI system ready to run the Guru Peyarchi Homam promotional campaign: fix opt_in_source on existing contacts, load event FAQs, tune the AI reply prompt, and create the WhatsApp template record.

**Architecture:** Pure data/configuration work — no new routes or services. The existing bulk-send endpoint (`POST /api/v1/upload/bulk-send`) and AI reply pipeline handle everything once the data is correct. Two SQL migrations + one Python seed script.

**Tech Stack:** Supabase (PostgreSQL), FastAPI, Python 3.11, existing Meta Cloud template sending via `send_template_message`.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `backend/supabase/migrations/028_homam_campaign_prep.sql` | Create | Update null opt_in_source on uploaded leads; seed Homam FAQs; insert template record |
| `backend/app/scripts/seed_homam_prompt.py` | Create | One-off script to upsert the Homam AI reply prompt into ai_prompts table |
| `backend/tests/test_v1_campaign.py` | Create | Verify bulk-send eligibility logic and FAQ keyword matching |

---

## Task 1: Audit existing opt_in_source distribution

**Files:**
- No file changes — read-only SQL audit

- [ ] **Step 1: Run audit query in Supabase SQL editor**

```sql
SELECT
  opt_in_source,
  source,
  count(*) as lead_count
FROM leads
WHERE deleted_at IS NULL
GROUP BY opt_in_source, source
ORDER BY lead_count DESC;
```

Expected output reveals how many leads have `null`, `'manual'`, `'imported'`, etc. Leads with `null` or `'manual'` opt_in_source will be blocked by bulk-send. Note the counts before proceeding.

- [ ] **Step 2: Check how many are currently bulk-send eligible**

```sql
SELECT count(*) as eligible
FROM leads
WHERE deleted_at IS NULL
  AND opt_in_source IS NOT NULL
  AND opt_in_source != 'manual';
```

If this is zero or very small, confirm the migration in Task 2 is needed before any campaign.

---

## Task 2: Migration — fix opt_in_source on uploaded leads

**Files:**
- Create: `backend/supabase/migrations/028_homam_campaign_prep.sql`

The CHECK constraint on `leads.opt_in_source` allows: `click_to_wa_ad`, `website_form`, `offline_event`, `previous_enquiry`, `imported`, `manual`. Contacts from a previous religious event database should be tagged `'offline_event'` — this allows bulk utility template sends.

- [ ] **Step 1: Write the migration**

```sql
-- 028_homam_campaign_prep.sql
-- Mark uploaded leads that have no opt-in source as offline_event attendees.
-- These are contacts from previous Homam/event attendance or temple enquiries.
-- This enables bulk utility template sends (not marketing) to them.

UPDATE leads
SET opt_in_source = 'offline_event'
WHERE opt_in_source IS NULL
  AND source = 'upload'
  AND deleted_at IS NULL;

-- Also update 'manual' leads that were uploaded (not manually created via telecaller)
-- Only if they have no call history — pure upload contacts misclassified as manual
UPDATE leads
SET opt_in_source = 'offline_event'
WHERE opt_in_source = 'manual'
  AND source = 'upload'
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT lead_id FROM call_logs WHERE lead_id IS NOT NULL
  );
```

- [ ] **Step 2: Run in Supabase SQL editor (test environment first)**

Paste the SQL above into Supabase SQL editor for your staging/dev project. Verify row counts match audit from Task 1.

```sql
-- Verify after running:
SELECT count(*) FROM leads WHERE opt_in_source = 'offline_event';
```

- [ ] **Step 3: Apply to production**

Apply the same SQL in the Supabase production SQL editor. Confirm counts match expectations.

- [ ] **Step 4: Re-run eligibility check**

```sql
SELECT count(*) as now_eligible
FROM leads
WHERE deleted_at IS NULL
  AND opt_in_source IS NOT NULL
  AND opt_in_source != 'manual';
```

Expected: count matches your 10k–15k contacts.

---

## Task 3: Write and run the campaign eligibility test

**Files:**
- Create: `backend/tests/test_v1_campaign.py`

- [ ] **Step 1: Write the tests**

```python
# backend/tests/test_v1_campaign.py
"""
Verify bulk-send eligibility logic and FAQ keyword matching.
These tests run against the existing code without network calls.
"""
import pytest
from unittest.mock import MagicMock, patch


# --- Bulk-send eligibility ---

def _is_eligible(opt_in_source: str | None) -> bool:
    """Mirrors the gate logic in upload.py:bulk_send()"""
    source = (opt_in_source or "").strip().lower()
    return bool(source) and source != "manual"


@pytest.mark.parametrize("source,expected", [
    ("offline_event", True),
    ("previous_enquiry", True),
    ("imported", True),
    ("website_form", True),
    ("click_to_wa_ad", True),
    ("manual", False),
    (None, False),
    ("", False),
])
def test_bulk_send_eligibility(source, expected):
    assert _is_eligible(source) is expected


# --- FAQ keyword matching ---

def test_faq_keyword_match_homam():
    """Simulate the FAQ check: Homam keywords must match FAQ rows."""
    from app.services.ai_reply import _check_faq

    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "id": "faq-1",
            "answer": "The Guru Peyarchi Homam will be performed on the auspicious day. You will receive video proof after.",
            "keywords": ["homam", "pooja", "peyarchi", "guru"],
            "hit_count": 0,
        }
    ]
    # Mock the update call for hit_count
    mock_db.table.return_value.update.return_value.eq.return_value.execute.return_value = None

    result = _check_faq("I want to know about the homam", mock_db)
    assert result is not None
    assert "video proof" in result.lower() or "homam" in result.lower()


def test_faq_keyword_no_match():
    """Non-Homam message should not match Homam FAQ."""
    from app.services.ai_reply import _check_faq

    mock_db = MagicMock()
    mock_db.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "id": "faq-1",
            "answer": "The Guru Peyarchi Homam will be performed on the auspicious day.",
            "keywords": ["homam", "pooja", "peyarchi"],
            "hit_count": 0,
        }
    ]

    result = _check_faq("what is the fee for MBA", mock_db)
    assert result is None
```

- [ ] **Step 2: Run tests — expect PASS (logic already exists)**

```bash
cd backend
pytest tests/test_v1_campaign.py -v
```

Expected output:
```
PASSED tests/test_v1_campaign.py::test_bulk_send_eligibility[offline_event-True]
PASSED tests/test_v1_campaign.py::test_bulk_send_eligibility[manual-False]
PASSED tests/test_v1_campaign.py::test_bulk_send_eligibility[None-False]
PASSED tests/test_v1_campaign.py::test_faq_keyword_match_homam
PASSED tests/test_v1_campaign.py::test_faq_keyword_no_match
```

- [ ] **Step 3: Commit**

```bash
git add backend/tests/test_v1_campaign.py
git commit -m "test: add V1 campaign eligibility and FAQ matching tests"
```

---

## Task 4: Seed Homam FAQs into the database

**Files:**
- Create: `backend/app/scripts/seed_homam_faqs.py`

- [ ] **Step 1: Write the seed script**

```python
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
    tenant_id = "00000000-0000-0000-0000-000000000001"  # update if multi-tenant

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
```

- [ ] **Step 2: Run the script**

```bash
cd backend
python -m app.scripts.seed_homam_faqs
```

Expected output:
```
  INSERT: What is Guru Peyarchi Homam?
  INSERT: Do I need to be physically present?
  ...
Done. Inserted: 8, Skipped: 0
```

- [ ] **Step 3: Verify in Supabase**

```sql
SELECT question, array_length(keywords, 1) as keyword_count, active
FROM faqs
ORDER BY created_at DESC
LIMIT 10;
```

Confirm 8 rows with `active = true`.

- [ ] **Step 4: Commit**

```bash
git add backend/app/scripts/seed_homam_faqs.py
git commit -m "feat: seed Guru Peyarchi Homam FAQs"
```

---

## Task 5: Tune AI reply prompt for Homam context

**Files:**
- Create: `backend/app/scripts/seed_homam_prompt.py`

The AI reply falls back to a generic education consultancy prompt in [ai_reply.py:30-38](backend/app/services/ai_reply.py#L30-L38). For the Homam campaign, insert a tenant-specific prompt into `ai_prompts` that overrides this.

- [ ] **Step 1: Write the prompt seed script**

```python
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
    tenant_id = "00000000-0000-0000-0000-000000000001"  # update if multi-tenant

    # Upsert: update if exists, insert if not
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
```

- [ ] **Step 2: Run the script**

```bash
cd backend
python -m app.scripts.seed_homam_prompt
```

Expected: `Updated existing whatsapp_reply prompt.` or `Inserted new whatsapp_reply prompt.`

- [ ] **Step 3: Verify prompt cache is cleared on next deploy**

The prompt cache in `ai_reply.py` has a 60-second TTL. It will auto-expire. To force immediate invalidation, restart the backend process once:

```bash
# On your server / Railway / Render:
# Trigger a redeploy, or the 60s TTL will handle it automatically
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/scripts/seed_homam_prompt.py
git commit -m "feat: seed Guru Peyarchi Homam AI reply prompt"
```

---

## Task 6: Create the WhatsApp template record

**Files:**
- No code — SQL insert + Meta Business Manager action

The template must be submitted in Meta Business Manager AND recorded in the local `message_templates` table so the bulk-send UI can reference it by name.

- [ ] **Step 1: Draft the template message**

Category: `UTILITY` (required for `offline_event` opt_in_source leads)

Template name: `guru_peyarchi_homam_invite` (lowercase, underscores only — Meta requirement)

Template body (160 chars max for body, no variables needed for V1 broadcast):

```
🙏 Namaskaram {{1}},

Guru Peyarchi Homam is being performed at our temple on the auspicious day.

Book now and receive:
✅ Personalized pooja on your behalf
✅ Video proof sent to you
✅ Prasadam delivered to your door

Reply YES to book. 🙏
```

Note: `{{1}}` is the lead name variable. If Meta requires at least one variable, use the name. If all leads have names, this works. If some don't, use a fallback like "Devotee".

- [ ] **Step 2: Submit in Meta Business Manager**

1. Go to Meta Business Manager → WhatsApp Manager → Message Templates
2. Click "Create Template"
3. Category: `Utility`
4. Name: `guru_peyarchi_homam_invite`
5. Language: `English`
6. Paste the body text above
7. Submit for review

Approval takes 24–72 hours. **Do not run bulk-send until status shows APPROVED.**

- [ ] **Step 3: Insert record into local database**

Once Meta approves, run this SQL in Supabase:

```sql
INSERT INTO message_templates (name, category, language, body_text, status, meta_template_id)
VALUES (
  'guru_peyarchi_homam_invite',
  'UTILITY',
  'en',
  '🙏 Namaskaram {{1}},\n\nGuru Peyarchi Homam is being performed at our temple on the auspicious day.\n\nBook now and receive:\n✅ Personalized pooja on your behalf\n✅ Video proof sent to you\n✅ Prasadam delivered to your door\n\nReply YES to book. 🙏',
  'APPROVED',
  '<paste_meta_template_id_here>'
);
```

Replace `<paste_meta_template_id_here>` with the template ID from Meta Business Manager.

---

## Task 7: Run pre-campaign smoke test

**Files:**
- No new files — use existing endpoints

- [ ] **Step 1: Test with 5 leads before full broadcast**

Using the dashboard Upload page or via curl, run a bulk-send to 5 test phone numbers (your own + team members):

```bash
curl -X POST https://your-api/api/v1/upload/bulk-send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "leads": [
      {"phone": "+919XXXXXXXXX", "name": "Test User", "opt_in_source": "offline_event"},
      {"phone": "+919XXXXXXXXX", "name": "Test User 2", "opt_in_source": "offline_event"}
    ],
    "template_name": "guru_peyarchi_homam_invite",
    "schedule_type": "immediate"
  }'
```

Expected response:
```json
{"queued": 2, "sent": 2, "failed": 0, "rejected": 0, "number_used": "+91XXXXXXXXXX"}
```

- [ ] **Step 2: Verify inbound reply flow**

Reply "YES" from one of the test numbers. Check:
1. Lead appears in Leads page (segment C or B depending on score)
2. AI auto-reply responds with the Homam-tuned prompt
3. Score updates after reply

- [ ] **Step 3: Verify hot lead routing**

Reply multiple positive messages from test number until score ≥ 7. Check:
1. Hot lead alert banner appears in dashboard
2. Lead is auto-assigned to a telecaller

- [ ] **Step 4: Commit test artifacts (if any) and final V1 tag**

```bash
git add backend/supabase/migrations/028_homam_campaign_prep.sql
git commit -m "feat: V1 Homam campaign — opt_in_source migration and content setup"
git tag v1-homam-campaign-ready
```

---

## V1 Launch Checklist

Before running the full 10k–15k broadcast:

- [ ] Migration 028 applied to production — opt_in_source updated on all uploaded leads
- [ ] Template `guru_peyarchi_homam_invite` status = APPROVED in Meta Business Manager
- [ ] Template record inserted in `message_templates` table
- [ ] Homam FAQs loaded (8 rows active in `faqs` table)
- [ ] AI prompt updated for Homam context
- [ ] 5-lead smoke test passed — sends delivered, auto-reply working
- [ ] Telecallers assigned and active in dashboard
- [ ] Hot lead alerts tested end-to-end
- [ ] Opted-out leads confirmed excluded from bulk-send

**Estimated time to complete V1:** 4–6 hours of hands-on work + 24–72 hours waiting for Meta template approval.
