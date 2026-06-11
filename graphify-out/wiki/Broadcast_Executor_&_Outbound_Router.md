# Broadcast Executor & Outbound Router

> 15 nodes · cohesion 0.19

## Key Concepts

- **execute_broadcast()** (11 connections) — `backend/app/services/broadcast_executor.py`
- **broadcast_executor.py** (5 connections) — `backend/app/services/broadcast_executor.py`
- **_process_scheduled_broadcasts()** (4 connections) — `backend/app/main.py`
- **_finish()** (4 connections) — `backend/app/services/broadcast_executor.py`
- **increment_send_count()** (4 connections) — `backend/app/services/outbound_router.py`
- **_normalize_phone()** (3 connections) — `backend/app/services/broadcast_executor.py`
- **str** (3 connections) — `backend/app/services/broadcast_executor.py`
- **_clean_text()** (3 connections) — `backend/app/services/broadcast_executor.py`
- **get_best_number()** (3 connections) — `backend/app/services/outbound_router.py`
- **int** (2 connections) — `backend/app/services/outbound_router.py`
- **str** (2 connections) — `backend/app/services/outbound_router.py`
- **APScheduler job: fire scheduled_broadcasts rows whose fire_at has passed.** (1 connections) — `backend/app/main.py`
- **Execute a scheduled broadcast row from the scheduled_broadcasts table.** (1 connections) — `backend/app/services/broadcast_executor.py`
- **Run a single scheduled_broadcasts row and return a result dict.** (1 connections) — `backend/app/services/broadcast_executor.py`
- **_warmup_daily_cap()** (1 connections) — `backend/app/services/outbound_router.py`

## Relationships

- [[Leads API]] (2 shared connections)
- [[CSV Upload & Bulk Send]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)
- [[Autopilot & AI Agent Runtime]] (1 shared connections)

## Source Files

- `backend/app/main.py`
- `backend/app/services/broadcast_executor.py`
- `backend/app/services/outbound_router.py`

## Audit Trail

- EXTRACTED: 35 (73%)
- INFERRED: 13 (27%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*