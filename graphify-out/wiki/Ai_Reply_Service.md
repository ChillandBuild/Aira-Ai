# Ai Reply Service

> 11 nodes · cohesion 0.22

## Key Concepts

- **send_human_message()** (11 connections) — `backend/app/routes/leads.py`
- **send_instagram()** (8 connections) — `backend/app/services/ai_reply.py`
- **send_telegram()** (8 connections) — `backend/app/services/ai_reply.py`
- **send_facebook()** (8 connections) — `backend/app/services/ai_reply.py`
- **broadcast_custom_message()** (7 connections) — `backend/app/routes/leads.py`
- **Send an Instagram DM via Facebook Graph API (Messenger Platform for Instagram).** (1 connections) — `backend/app/services/ai_reply.py`
- **Send a Telegram message via Bot API. Returns message ID (as string) or None on f** (1 connections) — `backend/app/services/ai_reply.py`
- **Send a Facebook Messenger message via Graph API. Returns message id or None on f** (1 connections) — `backend/app/services/ai_reply.py`
- **Send an Instagram DM via Facebook Graph API (Messenger Platform for Instagram).** (1 connections) — `backend/app/services/ai_reply.py`
- **Send a Telegram message via Bot API. Returns message ID (as string) or None on f** (1 connections) — `backend/app/services/ai_reply.py`
- **Send a Facebook Messenger message via Graph API. Returns message id or None on f** (1 connections) — `backend/app/services/ai_reply.py`

## Relationships

- [[AI Reply Pipeline (Groq)]] (10 shared connections)
- [[Leads API]] (4 shared connections)
- [[Meta Cloud Service]] (3 shared connections)
- [[Callers CRUD & Coaching]] (2 shared connections)
- [[Pydantic Schemas]] (2 shared connections)
- [[Booking Flow]] (2 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)

## Source Files

- `backend/app/routes/leads.py`
- `backend/app/services/ai_reply.py`

## Audit Trail

- EXTRACTED: 27 (56%)
- INFERRED: 21 (44%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*