# Upload API

> 8 nodes · cohesion 0.25

## Key Concepts

- **refresh_broadcast_metrics()** (8 connections) — `backend/app/routes/upload.py`
- **_refresh_delivered_opened_timewindow()** (5 connections) — `backend/app/routes/upload.py`
- **Update delivered/opened counts via time-window fallback (legacy/compat).** (1 connections) — `backend/app/routes/upload.py`
- **Re-query delivery status for all broadcasts and update history.** (1 connections) — `backend/app/routes/upload.py`
- **Update delivered/opened counts via time-window fallback (legacy/compat).** (1 connections) — `backend/app/routes/upload.py`
- **Re-query delivery status for all broadcasts and update history.** (1 connections) — `backend/app/routes/upload.py`
- **Update delivered/opened counts via time-window fallback (legacy/compat).** (1 connections) — `backend/app/routes/upload.py`
- **Re-query delivery status for all broadcasts and update history.** (1 connections) — `backend/app/routes/upload.py`

## Relationships

- [[Upload API]] (3 shared connections)
- [[Callers CRUD & Coaching]] (1 shared connections)
- [[CSV Upload & Bulk Send]] (1 shared connections)

## Source Files

- `backend/app/routes/upload.py`

## Audit Trail

- EXTRACTED: 18 (95%)
- INFERRED: 1 (5%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*