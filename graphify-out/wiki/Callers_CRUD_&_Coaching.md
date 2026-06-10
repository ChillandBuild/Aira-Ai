# Callers CRUD & Coaching

> 41 nodes · cohesion 0.08

## Key Concepts

- **callers.py** (26 connections) — `backend/app/routes/callers.py`
- **str** (13 connections) — `backend/app/routes/callers.py`
- **UUID** (10 connections) — `backend/app/routes/callers.py`
- **update_my_status()** (7 connections) — `backend/app/routes/callers.py`
- **update_caller_target()** (7 connections) — `backend/app/routes/callers.py`
- **UpdateCaller** (6 connections) — `backend/app/routes/callers.py`
- **get_status_summary()** (6 connections) — `backend/app/routes/callers.py`
- **get_digest()** (6 connections) — `backend/app/routes/callers.py`
- **get_coaching()** (6 connections) — `backend/app/routes/callers.py`
- **get_caller_timeline()** (6 connections) — `backend/app/routes/callers.py`
- **get_round_robin()** (5 connections) — `backend/app/routes/callers.py`
- **toggle_round_robin()** (5 connections) — `backend/app/routes/callers.py`
- **trigger_digest()** (5 connections) — `backend/app/routes/callers.py`
- **CreateCaller** (4 connections) — `backend/app/routes/callers.py`
- **get_my_stats()** (4 connections) — `backend/app/routes/callers.py`
- **delete_caller()** (4 connections) — `backend/app/routes/callers.py`
- **list_caller_logs()** (4 connections) — `backend/app/routes/callers.py`
- **get_winners()** (4 connections) — `backend/app/routes/callers.py`
- **RoundRobinToggle** (3 connections) — `backend/app/routes/callers.py`
- **StatusToggle** (3 connections) — `backend/app/routes/callers.py`
- **get_my_status()** (3 connections) — `backend/app/routes/callers.py`
- **list_callers()** (3 connections) — `backend/app/routes/callers.py`
- **TargetUpdate** (3 connections) — `backend/app/routes/callers.py`
- **my_calls_today()** (3 connections) — `backend/app/routes/callers.py`
- **Enable or disable automatic round-robin lead assignment for new inbound leads.** (2 connections) — `backend/app/routes/callers.py`
- *... and 16 more nodes in this community*

## Relationships

- [[Leads & Conversations API]] (16 shared connections)
- [[Telecaller Assignment Engine]] (7 shared connections)
- [[Reengagement & Tenant]] (7 shared connections)
- [[Pydantic Schemas]] (5 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Caller Daily Digest]] (1 shared connections)

## Source Files

- `backend/app/routes/callers.py`
- `backend/app/services/call_coach.py`

## Audit Trail

- EXTRACTED: 136 (81%)
- INFERRED: 31 (19%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*