# Chat Handovers (escalation pool)

> 8 nodes · cohesion 0.32

## Key Concepts

- **chat_handovers.py** (6 connections) — `backend/app/routes/chat_handovers.py`
- **assignHandover()** (6 connections) — `frontend/app/dashboard/inbox/page.tsx`
- **resolveHandover()** (5 connections) — `frontend/app/dashboard/inbox/page.tsx`
- **handover_count()** (3 connections) — `backend/app/routes/chat_handovers.py`
- **AssignBody** (3 connections) — `backend/app/routes/chat_handovers.py`
- **list_handovers()** (2 connections) — `backend/app/routes/chat_handovers.py`
- **str** (2 connections) — `backend/app/routes/chat_handovers.py`
- **Sidebar badge polls this every 60s. Swallow transient Supabase     HTTP/2 discon** (1 connections) — `backend/app/routes/chat_handovers.py`

## Relationships

- [[Settings Page]] (4 shared connections)
- [[Leads & Conversations API]] (2 shared connections)
- [[Reengagement & Tenant]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Pydantic Schemas]] (1 shared connections)

## Source Files

- `backend/app/routes/chat_handovers.py`
- `frontend/app/dashboard/inbox/page.tsx`

## Audit Trail

- EXTRACTED: 24 (86%)
- INFERRED: 4 (14%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*