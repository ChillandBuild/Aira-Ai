# App Entry & Schedulers

> 13 nodes · cohesion 0.18

## Key Concepts

- **FastAPI** (32 connections) — `backend/app/main.py`
- **main.py** (13 connections) — `backend/app/main.py`
- **_check_token_health()** (4 connections) — `backend/app/main.py`
- **_process_automation_waits()** (3 connections) — `backend/app/main.py`
- **_create_token_incident()** (3 connections) — `backend/app/main.py`
- **_sweep_unassigned_leads()** (3 connections) — `backend/app/main.py`
- **lifespan()** (2 connections) — `backend/app/main.py`
- **health()** (2 connections) — `backend/app/main.py`
- **str** (1 connections) — `backend/app/main.py`
- **APScheduler job: resume automation wait-step executions that are due.** (1 connections) — `backend/app/main.py`
- **APScheduler daily job: validate Meta tokens for all tenants, create incidents if** (1 connections) — `backend/app/main.py`
- **trigger_error()** (1 connections) — `backend/app/main.py`
- **APScheduler job: state-based safety net that assigns any unassigned lead     who** (1 connections) — `backend/app/main.py`

## Relationships

- [[Instagram Channel]] (3 shared connections)
- [[Leads API]] (3 shared connections)
- [[Telecaller Assignment Engine]] (2 shared connections)
- [[Reengagement API]] (2 shared connections)
- [[Facebook / Webhook Verification]] (2 shared connections)
- [[Telegram Channel]] (2 shared connections)
- [[Score Engine v2 & Segmentation]] (1 shared connections)
- [[Reengagement Service]] (1 shared connections)
- [[Broadcast Executor & Outbound Router]] (1 shared connections)
- [[Bot Flow / Automation Engine]] (1 shared connections)
- [[CTWA Leads]] (1 shared connections)
- [[Inbound Lead Reporting]] (1 shared connections)

## Source Files

- `backend/app/main.py`

## Audit Trail

- EXTRACTED: 63 (94%)
- INFERRED: 4 (6%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*