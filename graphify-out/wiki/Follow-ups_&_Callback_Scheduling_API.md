# Follow-ups & Callback Scheduling API

> 31 nodes · cohesion 0.12

## Key Concepts

- **sync_follow_up_jobs()** (14 connections) — `backend/app/services/growth.py`
- **follow_ups.py** (12 connections) — `backend/app/routes/follow_ups.py`
- **growth.py** (10 connections) — `backend/app/services/growth.py`
- **run_due_follow_ups()** (9 connections) — `backend/app/routes/follow_ups.py`
- **get_or_create_campaign()** (9 connections) — `backend/app/services/growth.py`
- **str** (8 connections) — `backend/app/routes/follow_ups.py`
- **str** (8 connections) — `backend/app/services/growth.py`
- **build_follow_up_summary()** (7 connections) — `backend/app/services/growth.py`
- **createCallback()** (7 connections) — `frontend/app/dashboard/telecalling/lib/notes-api.ts`
- **utcnow()** (5 connections) — `backend/app/services/growth.py`
- **Any** (5 connections) — `backend/app/services/growth.py`
- **build_ad_performance()** (5 connections) — `backend/app/services/growth.py`
- **reschedule_callback()** (5 connections) — `backend/app/routes/follow_ups.py`
- **today_completed_callbacks()** (4 connections) — `backend/app/routes/follow_ups.py`
- **stage_depth()** (4 connections) — `backend/app/services/growth.py`
- **cancel_pending_follow_ups()** (4 connections) — `backend/app/services/growth.py`
- **all_callbacks()** (4 connections) — `backend/app/routes/follow_ups.py`
- **CallbackCreate** (3 connections) — `backend/app/routes/follow_ups.py`
- **summary()** (3 connections) — `backend/app/routes/follow_ups.py`
- **today_callbacks()** (3 connections) — `backend/app/routes/follow_ups.py`
- **datetime** (3 connections) — `backend/app/services/growth.py`
- **normalize_platform()** (3 connections) — `backend/app/services/growth.py`
- **CallbackReschedule** (3 connections) — `backend/app/routes/follow_ups.py`
- **callbacks_board()** (3 connections) — `backend/app/routes/follow_ups.py`
- **int** (1 connections) — `backend/app/routes/follow_ups.py`
- *... and 6 more nodes in this community*

## Relationships

- [[Leads & Conversations API]] (16 shared connections)
- [[Telecalling Context & Notes]] (5 shared connections)
- [[AI Reply Pipeline (Groq)]] (3 shared connections)
- [[Pydantic Schemas]] (2 shared connections)
- [[CSV Upload & Bulk Send]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Booking Flow]] (1 shared connections)
- [[Facebook / Webhook Verification]] (1 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)
- [[Calls API (TeleCMI dialer)]] (1 shared connections)
- [[Settings Page]] (1 shared connections)

## Source Files

- `backend/app/routes/follow_ups.py`
- `backend/app/services/growth.py`
- `frontend/app/dashboard/telecalling/lib/notes-api.ts`

## Audit Trail

- EXTRACTED: 118 (80%)
- INFERRED: 30 (20%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*