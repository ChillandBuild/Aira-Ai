# App Entry & Schedulers

> 22 nodes · cohesion 0.10

## Key Concepts

- **FastAPI** (45 connections) — `backend/app/main.py`
- **main.py** (15 connections) — `backend/app/main.py`
- **_check_token_health()** (7 connections) — `backend/app/main.py`
- **get_current_user()** (4 connections) — `/Users/prem/Documents/Aira Ai/backend/app/dependencies/auth.py`
- **get_system_admin()** (3 connections) — `/Users/prem/Documents/Aira Ai/backend/app/dependencies/system_admin.py`
- **_create_token_incident()** (3 connections) — `backend/app/main.py`
- **_record_scheduler_event()** (3 connections) — `backend/app/main.py`
- **auth.py** (2 connections) — `/Users/prem/Documents/Aira Ai/backend/app/dependencies/auth.py`
- **system_admin.py** (2 connections) — `/Users/prem/Documents/Aira Ai/backend/app/dependencies/system_admin.py`
- **lifespan()** (2 connections) — `backend/app/main.py`
- **health()** (2 connections) — `backend/app/main.py`
- **messages.py** (2 connections) — `/Users/prem/Documents/Aira Ai/backend/app/routes/messages.py`
- **CtwaLead** (2 connections) — `frontend/lib/api.ts`
- **HTTPAuthorizationCredentials** (1 connections) — `/Users/prem/Documents/Aira Ai/backend/app/dependencies/auth.py`
- **str** (1 connections) — `backend/app/main.py`
- **trigger_error()** (1 connections) — `backend/app/main.py`
- **APScheduler daily job: validate Meta tokens for all tenants, create incidents if** (1 connections) — `backend/app/main.py`
- **Persist every job run to scheduler_runs for the operator Scheduler Health     vi** (1 connections) — `backend/app/main.py`
- **Message history routes.  This module will expose endpoints for retrieving conver** (1 connections) — `/Users/prem/Documents/Aira Ai/backend/app/routes/messages.py`
- **APScheduler daily job: validate Meta tokens for all tenants, create incidents if** (1 connections) — `backend/app/main.py`
- **APScheduler daily job: validate Meta tokens for all tenants, create incidents if** (1 connections) — `backend/app/main.py`
- **APScheduler daily job: validate Meta tokens for all tenants, create incidents if** (1 connections) — `backend/app/main.py`

## Relationships

- [[Callers CRUD & Coaching]] (6 shared connections)
- [[Meta Cloud API Client]] (3 shared connections)
- [[Assignment Service]] (3 shared connections)
- [[App Entry & Schedulers]] (2 shared connections)
- [[Inbound Lead Reporting]] (2 shared connections)
- [[App Settings API]] (2 shared connections)
- [[Facebook / Webhook Verification]] (2 shared connections)
- [[Instagram Channel]] (2 shared connections)
- [[Score Engine v2 & Segmentation]] (1 shared connections)
- [[Broadcast Retry Service]] (1 shared connections)
- [[Telecaller Assignment Engine]] (1 shared connections)
- [[Reengagement Service]] (1 shared connections)

## Source Files

- `/Users/prem/Documents/Aira Ai/backend/app/dependencies/auth.py`
- `/Users/prem/Documents/Aira Ai/backend/app/dependencies/system_admin.py`
- `/Users/prem/Documents/Aira Ai/backend/app/routes/messages.py`
- `backend/app/main.py`
- `frontend/lib/api.ts`

## Audit Trail

- EXTRACTED: 94 (93%)
- INFERRED: 7 (7%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*