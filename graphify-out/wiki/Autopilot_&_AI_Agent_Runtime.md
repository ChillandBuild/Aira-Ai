# Autopilot & AI Agent Runtime

> 40 nodes · cohesion 0.12

## Key Concepts

- **autopilot.py** (20 connections) — `backend/app/services/autopilot.py`
- **str** (15 connections) — `backend/app/services/autopilot.py`
- **_drive()** (15 connections) — `backend/app/services/autopilot.py`
- **run_agent()** (12 connections) — `backend/app/services/agent_runtime.py`
- **run_autopilot()** (11 connections) — `backend/app/services/autopilot.py`
- **agent_runtime.py** (10 connections) — `backend/app/services/agent_runtime.py`
- **str** (8 connections) — `backend/app/services/agent_runtime.py`
- **_apply_outcome()** (7 connections) — `backend/app/services/autopilot.py`
- **_acquire()** (6 connections) — `backend/app/services/autopilot.py`
- **_handle_escalate()** (6 connections) — `backend/app/services/autopilot.py`
- **_decide()** (5 connections) — `backend/app/services/agent_runtime.py`
- **bool** (5 connections) — `backend/app/services/autopilot.py`
- **_build_system()** (5 connections) — `backend/app/services/autopilot.py`
- **_send_and_record()** (5 connections) — `backend/app/services/autopilot.py`
- **_handle_book()** (5 connections) — `backend/app/services/autopilot.py`
- **_finish()** (5 connections) — `backend/app/services/autopilot.py`
- **_persist()** (5 connections) — `backend/app/services/autopilot.py`
- **_parse_decision()** (4 connections) — `backend/app/services/agent_runtime.py`
- **_now()** (4 connections) — `backend/app/services/autopilot.py`
- **_load_active_run()** (4 connections) — `backend/app/services/autopilot.py`
- **_create_run()** (4 connections) — `backend/app/services/autopilot.py`
- **_trim()** (4 connections) — `backend/app/services/autopilot.py`
- **_score()** (4 connections) — `backend/app/services/autopilot.py`
- **state_key()** (3 connections) — `backend/app/services/agent_runtime.py`
- **_tool_assign_to_caller()** (3 connections) — `backend/app/services/agent_runtime.py`
- *... and 15 more nodes in this community*

## Relationships

- [[Template Submission (Meta)]] (4 shared connections)
- [[Telecaller Assignment Engine]] (2 shared connections)
- [[AI Reply Pipeline (Groq)]] (2 shared connections)
- [[Knowledge Base (pgvector RAG)]] (2 shared connections)
- [[Bot Flow / Automation Engine]] (1 shared connections)
- [[Broadcast Executor & Outbound Router]] (1 shared connections)
- [[Booking Flow]] (1 shared connections)
- [[Score Engine v2 & Segmentation]] (1 shared connections)
- [[Facebook / Webhook Verification]] (1 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[Telegram Channel]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)

## Source Files

- `backend/app/services/agent_runtime.py`
- `backend/app/services/autopilot.py`

## Audit Trail

- EXTRACTED: 184 (91%)
- INFERRED: 18 (9%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*