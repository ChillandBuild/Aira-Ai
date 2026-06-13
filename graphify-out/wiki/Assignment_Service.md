# Assignment Service

> 21 nodes · cohesion 0.11

## Key Concepts

- **auto_assign_lead()** (18 connections) — `backend/app/services/assignment.py`
- **telegram_webhook()** (15 connections) — `backend/app/routes/telegram.py`
- **maybe_assign_lead()** (14 connections) — `backend/app/services/assignment.py`
- **sweep_unassigned_leads()** (7 connections) — `backend/app/services/assignment.py`
- **_sweep_unassigned_leads()** (5 connections) — `backend/app/main.py`
- **int** (5 connections) — `backend/app/services/assignment.py`
- **telegram.py** (3 connections) — `backend/app/routes/telegram.py`
- **test_telegram.py** (2 connections) — `backend/tests/test_telegram.py`
- **test_telegram_webhook_new_lead()** (2 connections) — `backend/tests/test_telegram.py`
- **APScheduler job: state-based safety net that assigns any unassigned lead     who** (1 connections) — `backend/app/main.py`
- **str** (1 connections) — `backend/app/routes/telegram.py`
- **Request** (1 connections) — `backend/app/routes/telegram.py`
- **BackgroundTasks** (1 connections) — `backend/app/routes/telegram.py`
- **Assign lead to the active caller with the fewest OPEN leads (least-loaded     ro** (1 connections) — `backend/app/services/assignment.py`
- **Single gated entry point for auto-assignment.      Assigns iff the lead's CURREN** (1 connections) — `backend/app/services/assignment.py`
- **State-based safety net for auto-assignment.      Assigns any UNASSIGNED lead who** (1 connections) — `backend/app/services/assignment.py`
- **APScheduler job: state-based safety net that assigns any unassigned lead     who** (1 connections) — `backend/app/main.py`
- **APScheduler job: state-based safety net that assigns any unassigned lead     who** (1 connections) — `backend/app/main.py`
- **Single gated entry point for auto-assignment.      Assigns iff the lead's CURREN** (1 connections) — `backend/app/services/assignment.py`
- **State-based safety net for auto-assignment.      Assigns any UNASSIGNED lead who** (1 connections) — `backend/app/services/assignment.py`
- **Assign lead to the active caller with fewest assigned non-disqualified leads.** (1 connections) — `backend/app/services/assignment.py`

## Relationships

- [[Telecaller Assignment Engine]] (11 shared connections)
- [[App Entry & Schedulers]] (3 shared connections)
- [[Callers CRUD & Coaching]] (3 shared connections)
- [[AI Reply Pipeline (Groq)]] (3 shared connections)
- [[Tests: Booking Flow]] (2 shared connections)
- [[Notify Service]] (2 shared connections)
- [[Facebook / Webhook Verification]] (2 shared connections)
- [[Instagram Channel]] (2 shared connections)
- [[WhatsApp Inbound Webhook]] (2 shared connections)
- [[Meta Cloud Service]] (1 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)
- [[Growth Service]] (1 shared connections)

## Source Files

- `backend/app/main.py`
- `backend/app/routes/telegram.py`
- `backend/app/services/assignment.py`
- `backend/tests/test_telegram.py`

## Audit Trail

- EXTRACTED: 54 (65%)
- INFERRED: 29 (35%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*