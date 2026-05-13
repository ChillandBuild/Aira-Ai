# Aira AI — Session Handover
**Last updated:** 2026-05-13
**Branch:** main (all changes merged and pushed)
**Supabase project:** `tovmebyyjhvszwgvyfdm` (ap-northeast-1)

---

## What Was Built This Session

### 1. Guru Peyarchi Homam Campaign — V1 Ready
- Migration 028: fixed `opt_in_source` for uploaded leads → `offline_event` (enables bulk send)
- 8 Homam FAQs loaded into `faqs` table (active)
- AI reply prompt updated to Homam-specific Tamil content with pricing (₹499 / ₹419 + GST)
- Approved template `gurupeyarchi` synced to local DB (meta_template_id: `990247113981091`)
- **Campaign is ready to launch** — just upload CSV and click "Use for Bulk Send" on `gurupeyarchi`

### 2. Bookings / V2 Automation (built, not yet activated)
- Migrations 029 (bookings table) + 030 (lead_conversation_state) applied to production
- State machine: `collecting_name → rasi → nakshatram → gotram → address → awaiting_payment → confirmed`
- Razorpay payment service built (`services/payment_razorpay.py`)
- Admin bookings dashboard at `/dashboard/bookings`
- Booking amount: `BOOKING_AMOUNT_PAISE = 50000` (₹500) — needs updating to ₹499+GST or ₹419+GST based on booking type
- **NOT activated for Homam trial** — V1 uses telecallers to close/share payment link manually

### 3. Template Management — Fully Working
- WABA ID bug fixed (`meta_waba_id` vs `meta_phone_number_id`)
- Webhook-status endpoint moved to `public_router` (no auth — Meta can call it)
- Example values auto-injected for `{{N}}` variables (prevents Meta auto-rejection)
- Template form: category cards, title→name auto-gen, live WA preview
- **Quick Reply buttons** in template form — up to 3 buttons with live preview, submitted to Meta as QUICK_REPLY components
- Template view modal — click row for full body, rejection reason, Meta ID
- `get_template_status()` added to meta_cloud.py for manual sync
- **Key insight**: Meta requires example values for templates with variables — without them, instant rejection

### 4. Numbers Page Improvements
- Delete button now visible directly on row (was buried in Actions dropdown)
- Failover strategy decided: **Option B — auto-switch when primary quality goes RED** (not yet implemented)
- Phase 1 of Numbers redesign discussed — see open items below

### 5. Opt-Out Mechanism Expanded
- `_STOP_WORDS` in `webhook.py` now includes: `not interested`, `no thanks`, `remove me`, `dont send`, `ஆர்வமில்லை`, `வேண்டாம்`
- Button replies matching these words → lead marked `opted_out=True`, `ai_enabled=False`, no AI reply

### 6. CSV Upload — Indian Number Auto-Formatting
- 10-digit Indian numbers (starting with 6/7/8/9) → auto-prefixed with `+91`
- Handles: `9876543210`, `09876543210`, `919876543210`, `+919876543210` all correctly

---

## Current Meta / WhatsApp State

### WABA: `1190331789463566` (AstroTamil)
All 4 phone numbers under this WABA:
| Phone Number ID | Number | Status | Notes |
|---|---|---|---|
| `639558505904219` | +91 90473 70380 | GREEN quality, EXPIRED verification | **Production number** — webhook points here |
| `876085862249417` | +91 90427 81088 | GREEN quality, EXPIRED verification | Indian standby |
| `891416117380332` | +1 555-839-7850 | VERIFIED | Meta test number |
| `905231102666086` | +1 555-898-0328 | VERIFIED | Meta test number |

### Active app_settings (Supabase):
- `meta_waba_id`: `1190331789463566`
- `meta_phone_number_id`: `639558505904219`
- `meta_access_token`: Render env var token (EAAaulytAEKUBRWGI...) — **this is the WORKING token**
- `meta_webhook_verify_token`: `aira_super_secret_token_2`

### Templates in dashboard:
| Name | Status | Meta ID | Notes |
|---|---|---|---|
| `gurupeyarchi` | ✅ APPROVED | `990247113981091` | Tamil, June 2 date, prasadam + video proof. **Use for broadcast** |
| `homam_invite_v3` | ⏳ PENDING | `827810040387372` | Tamil + `{{1}}` personalization. Awaiting Meta review |
| `homam_booking_2026` | ❌ REJECTED | `1963170004292897` | INVALID_FORMAT rejection |

### Approved templates in Meta WABA (not all in dashboard):
`kumbabishekam`, `system_booking_reminder_new`, `testing`, `gurupeyarchi`, `newutility` and ~15 more — all APPROVED. Can be imported to dashboard by adding to `message_templates` table.

---

## Numbers Page — Current DB State
The `phone_numbers` table has **placeholder/test data** (`+919876543210`, etc.) — NOT the real production numbers. Real numbers need to be added:
- Add `+91 90473 70380` (ID: `639558505904219`) as **Primary**
- Add `+91 90427 81088` (ID: `876085862249417`) as **Standby**

Both Indian numbers are at **Tier 1 (1,000 messages/day)**. Need to reach Tier 2 (10,000/day) before June 2 broadcast.

---

## Open Items / Next Session

### 🔴 Critical for June 2 campaign

1. **Add real numbers to Numbers page**
   - Delete placeholder entries
   - Add `+91 90473 70380` as Primary (Meta phone ID: `639558505904219`)
   - Add `+91 90427 81088` as Standby (Meta phone ID: `876085862249417`)

2. **Start tier upgrade warm-up NOW**
   - Send 500–1,000 messages/day on each number starting today
   - Use `gurupeyarchi` template on a small batch (e.g. first 1,000 contacts)
   - After 2–3 days at limit → Meta auto-upgrades to Tier 2 (10,000/day)
   - By ~May 20: both numbers at Tier 2 → can send 20,000/day → 15k broadcast on June 1

3. **Wait for `homam_invite_v3` approval** (24–72 hrs)
   - If approved: personalized Tamil template with `{{1}}` name variable
   - Better for the main 15k broadcast than `gurupeyarchi` (no personalization)

### 🟡 Numbers page (planned, not built)

4. **Auto-failover: Option B** — auto-switch primary→standby when quality goes RED
   - Backend: `failover.py` has `handle_quality_red()` — needs to auto-promote standby
   - Frontend: show failover banner, add manual override button

5. **Live Meta data sync on Numbers page**
   - Add "Sync from Meta" button that calls `GET /{waba_id}/phone_numbers` and updates quality/tier in DB
   - Show `verified_name`, `code_verification_status`, `throughput.level` per row

6. **Batch send distribution across multiple numbers**
   - Current: bulk-send uses `get_best_number()` which picks single number
   - Needed: distribute 15k contacts across 2 numbers (7,500 each) for tier-1 safety

### 🟡 Template improvements

7. **Submit `homam_invite_v3` equivalent with Quick Reply buttons**
   - Buttons: `பதிவு செய்ய` (Book) + `வேண்டாம்` (Not Interested)
   - "Not Interested" triggers opt-out via `_STOP_WORDS`
   - Requires Meta approval (24–72 hrs)

8. **Import existing approved templates from Meta**
   - Build "Import from Meta" button on Templates page
   - Calls `GET /{waba_id}/message_templates` → bulk-inserts missing templates to DB

### 🟢 V2 booking automation (built, needs configuration)

9. **Update booking amount**
   - `BOOKING_AMOUNT_PAISE = 50000` in `booking_flow.py` → Individual: ₹499+GST, Family: ₹419+GST
   - Add booking_type step to flow: "Individual or Family?"
   - Route payment amount based on type

10. **Configure Razorpay**
    - Add `razorpay_key_id`, `razorpay_key_secret`, `razorpay_webhook_secret` to `app_settings`
    - Register webhook URL in Razorpay Dashboard

---

## Critical Token Situation

The `meta_access_token` in Supabase app_settings has been updated multiple times this session. The **working token** is in the Render environment variable `META_ACCESS_TOKEN`. The code reads from Supabase first (60s TTL cache), then falls back to env var.

**Current state**: Supabase has the working Render token (`EAAaulytAEKUBRWGI...`). If the Render env var and Supabase ever differ again, Supabase wins.

To avoid confusion in future: set `META_ACCESS_TOKEN` in Render env vars AND keep Supabase in sync.

---

## Test Suite
24 tests, all passing: `backend/tests/` covers template route (4), booking flow (6), payment (4), campaign (10).

Run: `cd backend && source venv/bin/activate && python -m pytest tests/ -q`
