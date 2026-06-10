# AI Reply Pipeline (Groq)

> 38 nodes · cohesion 0.11

## Key Concepts

- **generate_reply()** (32 connections) — `backend/app/services/ai_reply.py`
- **ai_reply.py** (21 connections) — `backend/app/services/ai_reply.py`
- **str** (18 connections) — `backend/app/services/ai_reply.py`
- **send_human_message()** (11 connections) — `backend/app/routes/leads.py`
- **_send_text_via_channel()** (10 connections) — `backend/app/services/automation_engine.py`
- **send_instagram()** (8 connections) — `backend/app/services/ai_reply.py`
- **send_telegram()** (8 connections) — `backend/app/services/ai_reply.py`
- **send_facebook()** (8 connections) — `backend/app/services/ai_reply.py`
- **_trigger_chat_escalation()** (7 connections) — `backend/app/services/ai_reply.py`
- **broadcast_custom_message()** (7 connections) — `backend/app/routes/leads.py`
- **RuntimeError** (7 connections)
- **generate_reengagement_message()** (6 connections) — `backend/app/services/ai_reply.py`
- **_is_similar()** (6 connections) — `backend/app/services/ai_reply.py`
- **fetchConversations()** (6 connections) — `frontend/app/dashboard/conversations/page.tsx`
- **_groq_complete()** (5 connections) — `backend/app/services/ai_reply.py`
- **_groq_chat()** (5 connections) — `backend/app/services/ai_reply.py`
- **_recent_thread()** (5 connections) — `backend/app/services/ai_reply.py`
- **_get_prompt()** (4 connections) — `backend/app/services/ai_reply.py`
- **_detect_lang()** (4 connections) — `backend/app/services/ai_reply.py`
- **get_last_send_error()** (4 connections) — `backend/app/services/ai_reply.py`
- **_is_generic_fallback()** (4 connections) — `backend/app/services/ai_reply.py`
- **_resolve_campaign()** (4 connections) — `backend/app/services/ai_reply.py`
- **int** (3 connections) — `backend/app/services/ai_reply.py`
- **bool** (3 connections) — `backend/app/services/ai_reply.py`
- **invalidate_prompt_cache()** (2 connections) — `backend/app/services/ai_reply.py`
- *... and 13 more nodes in this community*

## Relationships

- [[Leads & Conversations API]] (11 shared connections)
- [[Booking Flow]] (7 shared connections)
- [[Telecaller Assignment Engine]] (7 shared connections)
- [[Template Submission (Meta)]] (4 shared connections)
- [[Bot Flow / Automation Engine]] (4 shared connections)
- [[Follow-ups & Callback Scheduling API]] (3 shared connections)
- [[Pydantic Schemas]] (2 shared connections)
- [[Knowledge Base (pgvector RAG)]] (2 shared connections)
- [[Autopilot & AI Agent Runtime]] (2 shared connections)
- [[Reengagement & Tenant]] (1 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)

## Source Files

- `backend/app/routes/leads.py`
- `backend/app/services/ai_reply.py`
- `backend/app/services/automation_engine.py`
- `frontend/app/dashboard/conversations/page.tsx`

## Audit Trail

- EXTRACTED: 150 (71%)
- INFERRED: 61 (29%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*