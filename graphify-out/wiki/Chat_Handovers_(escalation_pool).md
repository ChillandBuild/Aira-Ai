# Chat Handovers (escalation pool)

> 10 nodes · cohesion 0.31

## Key Concepts

- **chat_handovers.py** (8 connections) — `backend/app/routes/chat_handovers.py`
- **assignHandover()** (6 connections) — `frontend/app/dashboard/inbox/page.tsx`
- **assign_handover()** (5 connections) — `backend/app/routes/chat_handovers.py`
- **resolveHandover()** (5 connections) — `frontend/app/dashboard/inbox/page.tsx`
- **AssignBody** (4 connections) — `backend/app/routes/chat_handovers.py`
- **str** (4 connections) — `backend/app/routes/chat_handovers.py`
- **resolve_handover()** (4 connections) — `backend/app/routes/chat_handovers.py`
- **handover_count()** (3 connections) — `backend/app/routes/chat_handovers.py`
- **list_handovers()** (2 connections) — `backend/app/routes/chat_handovers.py`
- **Sidebar badge polls this every 60s. Swallow transient Supabase     HTTP/2 discon** (1 connections) — `backend/app/routes/chat_handovers.py`

## Relationships

- [[Callers CRUD & Coaching]] (4 shared connections)
- [[Meta Cloud API Client]] (4 shared connections)
- [[Inboxconfigpanel (frontend)]] (2 shared connections)
- [[Notes Api (frontend)]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Pydantic Schemas]] (1 shared connections)

## Source Files

- `backend/app/routes/chat_handovers.py`
- `frontend/app/dashboard/inbox/page.tsx`

## Audit Trail

- EXTRACTED: 34 (81%)
- INFERRED: 8 (19%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*