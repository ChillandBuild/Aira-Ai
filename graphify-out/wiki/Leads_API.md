# Leads API

> 40 nodes · cohesion 0.09

## Key Concepts

- **leads.py** (35 connections) — `backend/app/routes/leads.py`
- **str** (23 connections) — `backend/app/routes/leads.py`
- **UUID** (23 connections) — `backend/app/routes/leads.py`
- **compose_new_message()** (12 connections) — `backend/app/routes/leads.py`
- **update_lead()** (9 connections) — `backend/app/routes/leads.py`
- **manual_compact()** (9 connections) — `backend/app/routes/leads.py`
- **mark_converted()** (8 connections) — `backend/app/routes/leads.py`
- **clear_chat()** (8 connections) — `backend/app/routes/leads.py`
- **release_lead()** (8 connections) — `backend/app/routes/leads.py`
- **toggle_ai()** (7 connections) — `backend/app/routes/leads.py`
- **assign_lead()** (6 connections) — `backend/app/routes/leads.py`
- **toggle_archive()** (6 connections) — `backend/app/routes/leads.py`
- **toggle_block()** (6 connections) — `backend/app/routes/leads.py`
- **score_history()** (6 connections) — `backend/app/routes/leads.py`
- **list_leads()** (5 connections) — `backend/app/routes/leads.py`
- **get_lead()** (5 connections) — `backend/app/routes/leads.py`
- **toggle_pin()** (5 connections) — `backend/app/routes/leads.py`
- **delete_lead()** (5 connections) — `backend/app/routes/leads.py`
- **pre_call_brief()** (5 connections) — `backend/app/routes/leads.py`
- **get_lead_messages()** (4 connections) — `backend/app/routes/leads.py`
- **get_lead_call_logs()** (4 connections) — `backend/app/routes/leads.py`
- **export_leads()** (3 connections) — `backend/app/routes/leads.py`
- **export_assigned_leads()** (3 connections) — `backend/app/routes/leads.py`
- **Toggle a conversation's archived state (inbox tidy — does not stop AI).** (1 connections) — `backend/app/routes/leads.py`
- **Toggle a contact's blocked state — hides from active inbox and stops AI auto-rep** (1 connections) — `backend/app/routes/leads.py`
- *... and 15 more nodes in this community*

## Relationships

- [[Pydantic Schemas]] (27 shared connections)
- [[Callers CRUD & Coaching]] (20 shared connections)
- [[Meta Cloud API Client]] (15 shared connections)
- [[Growth Service]] (6 shared connections)
- [[Ai Reply Service]] (4 shared connections)
- [[Telecaller Assignment Engine]] (4 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Assignment Service]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)
- [[Booking Flow]] (1 shared connections)

## Source Files

- `backend/app/routes/leads.py`

## Audit Trail

- EXTRACTED: 165 (74%)
- INFERRED: 57 (26%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*