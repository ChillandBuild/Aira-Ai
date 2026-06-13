# Analytics API

> 19 nodes · cohesion 0.12

## Key Concepts

- **_window_aggregate()** (8 connections) — `backend/app/routes/analytics.py`
- **TelecallingAnalytics** (8 connections) — `frontend/lib/api.ts`
- **_ist_hour()** (7 connections) — `backend/app/routes/analytics.py`
- **telecalling_analytics()** (7 connections) — `backend/app/routes/analytics.py`
- **datetime** (5 connections) — `backend/app/routes/analytics.py`
- **_ist_today_start_utc()** (5 connections) — `backend/app/routes/analytics.py`
- **_caller_idle_minutes()** (5 connections) — `backend/app/routes/analytics.py`
- **_is_connected()** (4 connections) — `backend/app/routes/analytics.py`
- **int** (3 connections) — `backend/app/routes/analytics.py`
- **qa_queue()** (3 connections) — `backend/app/routes/analytics.py`
- **bool** (1 connections) — `backend/app/routes/analytics.py`
- **float** (1 connections) — `backend/app/routes/analytics.py`
- **Convert a UTC ISO string to IST hour (int).** (1 connections) — `backend/app/routes/analytics.py`
- **Midnight IST expressed as a UTC datetime.** (1 connections) — `backend/app/routes/analytics.py`
- **A call is 'connected' if it had talk time or a non-no_answer outcome.** (1 connections) — `backend/app/routes/analytics.py`
- **Idle minutes for one caller in [window_start, window_end): merged 'active'     i** (1 connections) — `backend/app/routes/analytics.py`
- **Aggregate metrics for a window, comparable in magnitude to the daily 'today'** (1 connections) — `backend/app/routes/analytics.py`
- **Convert a UTC ISO string to IST hour (int).** (1 connections) — `backend/app/routes/analytics.py`
- **Midnight IST expressed as a UTC datetime.** (1 connections) — `backend/app/routes/analytics.py`

## Relationships

- [[Analytics API]] (16 shared connections)
- [[Callers CRUD & Coaching]] (2 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)
- [[Analytics Page]] (1 shared connections)
- [[API Client (frontend)]] (1 shared connections)
- [[Api (frontend)]] (1 shared connections)

## Source Files

- `backend/app/routes/analytics.py`
- `frontend/lib/api.ts`

## Audit Trail

- EXTRACTED: 61 (95%)
- INFERRED: 3 (5%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*