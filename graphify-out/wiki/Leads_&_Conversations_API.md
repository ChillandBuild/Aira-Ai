# Leads & Conversations API

> 34 nodes · cohesion 0.15

## Key Concepts

- **get_supabase()** (178 connections) — `backend/app/db/supabase.py`
- **leads.py** (30 connections) — `backend/app/routes/leads.py`
- **str** (21 connections) — `backend/app/routes/leads.py`
- **UUID** (20 connections) — `backend/app/routes/leads.py`
- **record_stage_event()** (15 connections) — `backend/app/services/growth.py`
- **record_assignment_event()** (13 connections) — `backend/app/services/assignment.py`
- **compose_new_message()** (11 connections) — `backend/app/routes/leads.py`
- **update_lead()** (9 connections) — `backend/app/routes/leads.py`
- **mark_converted()** (8 connections) — `backend/app/routes/leads.py`
- **toggle_ai()** (7 connections) — `backend/app/routes/leads.py`
- **manual_compact()** (7 connections) — `backend/app/routes/leads.py`
- **takeover_lead()** (7 connections) — `backend/app/routes/leads.py`
- **assign_lead()** (6 connections) — `backend/app/routes/leads.py`
- **clear_chat()** (6 connections) — `backend/app/routes/leads.py`
- **release_lead()** (6 connections) — `backend/app/routes/leads.py`
- **list_leads()** (5 connections) — `backend/app/routes/leads.py`
- **get_lead()** (5 connections) — `backend/app/routes/leads.py`
- **toggle_pin()** (5 connections) — `backend/app/routes/leads.py`
- **delete_lead()** (5 connections) — `backend/app/routes/leads.py`
- **bulk_assign()** (5 connections) — `backend/app/routes/leads.py`
- **get_lead_messages()** (4 connections) — `backend/app/routes/leads.py`
- **get_lead_call_logs()** (4 connections) — `backend/app/routes/leads.py`
- **score_history()** (4 connections) — `backend/app/routes/leads.py`
- **list_conversations()** (3 connections) — `backend/app/routes/conversations.py`
- **export_leads()** (3 connections) — `backend/app/routes/leads.py`
- *... and 9 more nodes in this community*

## Relationships

- [[Pydantic Schemas]] (26 shared connections)
- [[Telecaller Assignment Engine]] (20 shared connections)
- [[Reengagement & Tenant]] (19 shared connections)
- [[Callers CRUD & Coaching]] (16 shared connections)
- [[Follow-ups & Callback Scheduling API]] (16 shared connections)
- [[Calls API (TeleCMI dialer)]] (14 shared connections)
- [[AI Reply Pipeline (Groq)]] (11 shared connections)
- [[CSV Upload & Bulk Send]] (10 shared connections)
- [[Template Submission (Meta)]] (8 shared connections)
- [[Automations API]] (6 shared connections)
- [[Knowledge Base (pgvector RAG)]] (6 shared connections)
- [[Operator Console & Audit]] (6 shared connections)

## Source Files

- `backend/app/db/supabase.py`
- `backend/app/routes/conversations.py`
- `backend/app/routes/leads.py`
- `backend/app/services/assignment.py`
- `backend/app/services/growth.py`

## Audit Trail

- EXTRACTED: 141 (35%)
- INFERRED: 257 (65%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*