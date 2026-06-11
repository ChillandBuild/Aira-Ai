# Reengagement API

> 15 nodes · cohesion 0.22

## Key Concepts

- **HTTPException** (96 connections)
- **reengagement.py** (9 connections) — `backend/app/routes/reengagement.py`
- **tenant.py** (5 connections) — `backend/app/dependencies/tenant.py`
- **get_tenant_id()** (4 connections) — `backend/app/dependencies/tenant.py`
- **list_steps()** (4 connections) — `backend/app/routes/reengagement.py`
- **create_step()** (4 connections) — `backend/app/routes/reengagement.py`
- **list_logs()** (4 connections) — `backend/app/routes/reengagement.py`
- **delete_step()** (4 connections) — `backend/app/routes/reengagement.py`
- **get_owner_tenant_id()** (3 connections) — `backend/app/dependencies/tenant.py`
- **ReengagementStepCreate** (3 connections) — `backend/app/routes/reengagement.py`
- **str** (3 connections) — `backend/app/routes/reengagement.py`
- **trigger_now()** (3 connections) — `backend/app/routes/reengagement.py`
- **str** (2 connections) — `backend/app/dependencies/tenant.py`
- **require_owner()** (2 connections) — `backend/app/dependencies/tenant.py`
- **Owner-only tenant id. Use for admin-only read endpoints so a caller     cannot r** (1 connections) — `backend/app/dependencies/tenant.py`

## Relationships

- [[Leads API]] (19 shared connections)
- [[Meta Cloud API Client]] (13 shared connections)
- [[Templates API]] (9 shared connections)
- [[Callers CRUD & Coaching]] (7 shared connections)
- [[CSV Upload & Bulk Send]] (6 shared connections)
- [[Automations API]] (5 shared connections)
- [[Calls API (TeleCMI dialer)]] (5 shared connections)
- [[Operator Console & Audit]] (5 shared connections)
- [[App Settings API]] (4 shared connections)
- [[Telecaller Assignment Engine]] (3 shared connections)
- [[Phone Numbers Pool]] (3 shared connections)
- [[Broadcast Tags]] (3 shared connections)

## Source Files

- `backend/app/dependencies/tenant.py`
- `backend/app/routes/reengagement.py`

## Audit Trail

- EXTRACTED: 53 (36%)
- INFERRED: 94 (64%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*