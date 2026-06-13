# Telecaller Assignment Engine

> 57 nodes · cohesion 0.05

## Key Concepts

- **get_telecalling_config()** (22 connections) — `backend/app/services/assignment.py`
- **assignment.py** (17 connections) — `backend/app/services/assignment.py`
- **str** (16 connections) — `backend/app/services/assignment.py`
- **is_round_robin_enabled()** (14 connections) — `backend/app/services/assignment.py`
- **record_assignment_event()** (12 connections) — `backend/app/services/assignment.py`
- **reassign_backlog()** (10 connections) — `backend/app/services/assignment.py`
- **save_telecalling_config()** (10 connections) — `backend/app/services/assignment.py`
- **_process_callback_reassignments()** (9 connections) — `backend/app/main.py`
- **takeover_lead()** (9 connections) — `backend/app/routes/leads.py`
- **set_round_robin_enabled()** (7 connections) — `backend/app/services/assignment.py`
- **save_inbox_config()** (7 connections) — `backend/app/services/assignment.py`
- **should_escalate_to_inbox()** (7 connections) — `backend/app/services/assignment.py`
- **should_escalate_hot_lead()** (7 connections) — `backend/app/services/assignment.py`
- **should_assign_to_telecalling()** (7 connections) — `backend/app/services/assignment.py`
- **is_caller_on_call()** (7 connections) — `backend/app/services/assignment.py`
- **bool** (6 connections) — `backend/app/services/assignment.py`
- **get_caller_id_for_user()** (6 connections) — `backend/app/services/assignment.py`
- **bulk_assign()** (5 connections) — `backend/app/routes/leads.py`
- **_open_lead_count()** (5 connections) — `backend/app/services/assignment.py`
- **get_assignment_mode()** (2 connections) — `backend/app/routes/calls.py`
- **Flip the single auto-assign switch (telecalling_config.enabled).** (2 connections) — `backend/app/services/assignment.py`
- **APScheduler job: escalate overdue callbacks from inactive/busy callers (no auto-** (1 connections) — `backend/app/main.py`
- **Allow a telecaller to claim an overdue callback from an unavailable caller.** (1 connections) — `backend/app/routes/leads.py`
- **Whether auto-assign to telecallers is on.      Single source of truth: telecalli** (1 connections) — `backend/app/services/assignment.py`
- **Return callers.id for this auth user, or None if not a caller.** (1 connections) — `backend/app/services/assignment.py`
- *... and 32 more nodes in this community*

## Relationships

- [[Callers CRUD & Coaching]] (18 shared connections)
- [[Assignment Service]] (11 shared connections)
- [[App Settings API]] (8 shared connections)
- [[Calls API (TeleCMI dialer)]] (4 shared connections)
- [[Leads API]] (4 shared connections)
- [[AI Reply Pipeline (Groq)]] (4 shared connections)
- [[Meta Cloud API Client]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Notify Service]] (1 shared connections)
- [[Pydantic Schemas]] (1 shared connections)
- [[Tenant]] (1 shared connections)

## Source Files

- `backend/app/main.py`
- `backend/app/routes/calls.py`
- `backend/app/routes/leads.py`
- `backend/app/services/assignment.py`

## Audit Trail

- EXTRACTED: 175 (78%)
- INFERRED: 48 (22%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*