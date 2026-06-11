# Telecaller Assignment Engine

> 42 nodes · cohesion 0.08

## Key Concepts

- **auto_assign_lead()** (20 connections) — `backend/app/services/assignment.py`
- **get_telecalling_config()** (18 connections) — `backend/app/services/assignment.py`
- **assignment.py** (16 connections) — `backend/app/services/assignment.py`
- **str** (15 connections) — `backend/app/services/assignment.py`
- **is_round_robin_enabled()** (14 connections) — `backend/app/services/assignment.py`
- **maybe_assign_lead()** (13 connections) — `backend/app/services/assignment.py`
- **reassign_backlog()** (8 connections) — `backend/app/services/assignment.py`
- **save_telecalling_config()** (7 connections) — `backend/app/services/assignment.py`
- **should_escalate_hot_lead()** (6 connections) — `backend/app/services/assignment.py`
- **_process_callback_reassignments()** (6 connections) — `backend/app/main.py`
- **sweep_unassigned_leads()** (6 connections) — `backend/app/services/assignment.py`
- **is_caller_on_call()** (6 connections) — `backend/app/services/assignment.py`
- **bool** (5 connections) — `backend/app/services/assignment.py`
- **get_caller_id_for_user()** (5 connections) — `backend/app/services/assignment.py`
- **save_inbox_config()** (5 connections) — `backend/app/services/assignment.py`
- **should_escalate_to_inbox()** (5 connections) — `backend/app/services/assignment.py`
- **should_assign_to_telecalling()** (5 connections) — `backend/app/services/assignment.py`
- **_open_lead_count()** (5 connections) — `backend/app/services/assignment.py`
- **int** (5 connections) — `backend/app/services/assignment.py`
- **get_tenant_and_role()** (4 connections) — `backend/app/dependencies/tenant.py`
- **my_performance()** (4 connections) — `backend/app/routes/callers.py`
- **get_my_performance()** (3 connections) — `backend/app/routes/callers.py`
- **get_assignment_mode()** (2 connections) — `backend/app/routes/calls.py`
- **Check app_settings for round_robin_enabled flag. Defaults to True.** (1 connections) — `backend/app/services/assignment.py`
- **Upsert the round_robin_enabled flag in app_settings.** (1 connections) — `backend/app/services/assignment.py`
- *... and 17 more nodes in this community*

## Relationships

- [[Leads API]] (20 shared connections)
- [[App Settings API]] (7 shared connections)
- [[Callers CRUD & Coaching]] (7 shared connections)
- [[AI Reply Pipeline (Groq)]] (7 shared connections)
- [[Calls API (TeleCMI dialer)]] (4 shared connections)
- [[Reengagement API]] (3 shared connections)
- [[Facebook / Webhook Verification]] (2 shared connections)
- [[Instagram Channel]] (2 shared connections)
- [[Telegram Channel]] (2 shared connections)
- [[WhatsApp Inbound Webhook]] (2 shared connections)
- [[Autopilot & AI Agent Runtime]] (2 shared connections)
- [[Bot Flow / Automation Engine]] (2 shared connections)

## Source Files

- `backend/app/dependencies/tenant.py`
- `backend/app/main.py`
- `backend/app/routes/callers.py`
- `backend/app/routes/calls.py`
- `backend/app/services/assignment.py`

## Audit Trail

- EXTRACTED: 142 (70%)
- INFERRED: 60 (30%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*