# Notify Service

> 10 nodes · cohesion 0.36

## Key Concepts

- **notify_assigned_caller_of_reply()** (9 connections) — `backend/app/services/notify.py`
- **notify_pool()** (8 connections) — `backend/app/services/notify.py`
- **notify_user()** (6 connections) — `backend/app/services/notify.py`
- **notify.py** (5 connections) — `backend/app/services/notify.py`
- **str** (5 connections) — `backend/app/services/notify.py`
- **_active_caller_user_ids()** (3 connections) — `backend/app/services/notify.py`
- **_owner_user_id()** (3 connections) — `backend/app/services/notify.py`
- **Insert a single notification for one user. Best-effort: never raises.** (1 connections) — `backend/app/services/notify.py`
- **Notify the caller who owns this lead that the lead replied. Best-effort.** (1 connections) — `backend/app/services/notify.py`
- **Fan out one notification per active caller + owner. Best-effort: never raises.** (1 connections) — `backend/app/services/notify.py`

## Relationships

- [[Callers CRUD & Coaching]] (3 shared connections)
- [[Assignment Service]] (2 shared connections)
- [[Facebook / Webhook Verification]] (1 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)
- [[Telecaller Assignment Engine]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)

## Source Files

- `backend/app/services/notify.py`

## Audit Trail

- EXTRACTED: 32 (76%)
- INFERRED: 10 (24%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*