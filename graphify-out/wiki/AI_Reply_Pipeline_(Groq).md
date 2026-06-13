# AI Reply Pipeline (Groq)

> 32 nodes · cohesion 0.12

## Key Concepts

- **generate_reply()** (35 connections) — `backend/app/services/ai_reply.py`
- **ai_reply.py** (22 connections) — `backend/app/services/ai_reply.py`
- **str** (19 connections) — `backend/app/services/ai_reply.py`
- **_is_similar()** (7 connections) — `backend/app/services/ai_reply.py`
- **_trigger_chat_escalation()** (7 connections) — `backend/app/services/ai_reply.py`
- **generate_reengagement_message()** (6 connections) — `backend/app/services/ai_reply.py`
- **fetchConversations()** (6 connections) — `frontend/app/dashboard/conversations/page.tsx`
- **_groq_complete()** (5 connections) — `backend/app/services/ai_reply.py`
- **_groq_chat()** (5 connections) — `backend/app/services/ai_reply.py`
- **_recent_thread()** (5 connections) — `backend/app/services/ai_reply.py`
- **_detect_lang()** (5 connections) — `backend/app/services/ai_reply.py`
- **_resolve_campaign()** (4 connections) — `backend/app/services/ai_reply.py`
- **_fetch_conversation_summary()** (4 connections) — `backend/app/services/ai_reply.py`
- **_get_prompt()** (4 connections) — `backend/app/services/ai_reply.py`
- **get_last_send_error()** (4 connections) — `backend/app/services/ai_reply.py`
- **_is_generic_fallback()** (4 connections) — `backend/app/services/ai_reply.py`
- **int** (3 connections) — `backend/app/services/ai_reply.py`
- **bool** (3 connections) — `backend/app/services/ai_reply.py`
- **float** (1 connections) — `backend/app/services/ai_reply.py`
- **Resolve the campaign this lead most recently belongs to, from lead_tag_interest** (1 connections) — `backend/app/services/ai_reply.py`
- **Fetch the compacted conversation_summary from lead_conversation_state.     Retur** (1 connections) — `backend/app/services/ai_reply.py`
- **Return dominant language code based on Unicode block frequency.** (1 connections) — `backend/app/services/ai_reply.py`
- **True if two messages share ≥threshold fraction of words (rough duplicate check).** (1 connections) — `backend/app/services/ai_reply.py`
- **Create a pending chat handover into the shared escalation pool.      The handove** (1 connections) — `backend/app/services/ai_reply.py`
- **Core pipeline:     1. Inject knowledge base context     2. Call Groq for reply** (1 connections) — `backend/app/services/ai_reply.py`
- *... and 7 more nodes in this community*

## Relationships

- [[Ai Reply Service]] (10 shared connections)
- [[Booking Flow]] (4 shared connections)
- [[Telecaller Assignment Engine]] (4 shared connections)
- [[Tests: Reengagement Service]] (3 shared connections)
- [[Callers CRUD & Coaching]] (3 shared connections)
- [[Assignment Service]] (3 shared connections)
- [[Growth Service]] (2 shared connections)
- [[Leads API]] (1 shared connections)
- [[Notify Service]] (1 shared connections)
- [[Meta Cloud Service]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)
- [[App Settings API]] (1 shared connections)

## Source Files

- `backend/app/services/ai_reply.py`
- `frontend/app/dashboard/conversations/page.tsx`

## Audit Trail

- EXTRACTED: 137 (85%)
- INFERRED: 25 (15%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*