# Reengagement Service

> 14 nodes · cohesion 0.22

## Key Concepts

- **_send_reengagement()** (9 connections) — `backend/app/services/reengagement_service.py`
- **process_due_reengagements()** (8 connections) — `backend/app/services/reengagement_service.py`
- **_send_step_template()** (6 connections) — `backend/app/services/reengagement_service.py`
- **reengagement_service.py** (5 connections) — `backend/app/services/reengagement_service.py`
- **utcnow()** (4 connections) — `backend/app/services/reengagement_service.py`
- **_process_reengagement_rules()** (3 connections) — `backend/app/main.py`
- **datetime** (2 connections) — `backend/app/services/reengagement_service.py`
- **str** (2 connections) — `backend/app/services/reengagement_service.py`
- **bool** (2 connections) — `backend/app/services/reengagement_service.py`
- **APScheduler job: process due automated re-engagement steps.** (1 connections) — `backend/app/main.py`
- **int** (1 connections) — `backend/app/services/reengagement_service.py`
- **Query and process all pending re-engagement steps for all tenants.** (1 connections) — `backend/app/services/reengagement_service.py`
- **Send a template message for a step and write message + reengagement logs.** (1 connections) — `backend/app/services/reengagement_service.py`
- **Send the re-engagement message to a single lead and write a log entry.** (1 connections) — `backend/app/services/reengagement_service.py`

## Relationships

- [[App Entry & Schedulers]] (1 shared connections)
- [[Leads & Conversations API]] (1 shared connections)
- [[Reengagement & Tenant]] (1 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)
- [[Booking Flow]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)

## Source Files

- `backend/app/main.py`
- `backend/app/services/reengagement_service.py`

## Audit Trail

- EXTRACTED: 39 (85%)
- INFERRED: 7 (15%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*