# CSV Upload / Bulk Send Context

## Current State
Basic upload built: backend/app/routes/upload.py, frontend/app/dashboard/upload/
Phase 1a: upgrade to 7-step flow. Extend existing files — do not rewrite from scratch.

## 7-Step Flow

**Step 1 — Parse & Map**
Auto-detect columns: name, phone, email, course. User confirms mapping.
E.164 phone validation. Duplicate check vs existing leads (by phone).
Backend: parse CSV, return detected mapping + duplicate count for user confirmation.

**Step 2 — Opt-in Declaration (mandatory gate)**
User picks opt_in_source for this entire batch (or per-row if CSV has a column).
Stored on each lead row. Determines allowed template types.
null opt_in_source → backend rejects entire batch from bulk send (400).

**Step 3 — Enrichment**
Meta WA number check API (~₹0.05/number). Results: valid_wa | landline | disconnected | invalid_format.
Show breakdown before user proceeds. Flag non-WA leads for telecalling queue instead.

**Step 4 — Template + Schedule**
User picks from pre-approved templates. Filter by opt_in_source permissions.
Preview renders with first contact's data (name, course).
Schedule options: send now | specific datetime | drip over N days.

**Step 5 — Pool-Aware Dispatch**
Compute: `SUM(messaging_tier) WHERE status='active' AND quality_rating != 'red'`
Suggest pace: spread across active numbers, 4-hour window, 9AM–1PM default.
Backend router picks number per message — no single number dumps entire batch.

**Step 6 — Real-Time Progress**
Supabase Realtime subscription on upload job status.
Frontend live counter: `sent/total • delivery% • read% • reply%`
Replies flow into conversations. Each replier auto-scored and segmented.

**Step 7 — Follow-Up Automation**
Extends backend/app/routes/follow_ups.py (already built):
- 24h no reply → optional re-engagement template (Celery task)
- 3 days no reply → auto-segment C
- 7 days no reply → auto-segment D or push to telecaller queue

## Key Files
- backend/app/routes/upload.py — extend for 7-step flow
- backend/app/routes/follow_ups.py — extend for drip automation
- backend/app/services/segmentation.py — called after each reply
- frontend/app/dashboard/upload/ — full 7-step UI (step wizard component)
