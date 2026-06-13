# Calls API (TeleCMI dialer)

> 46 nodes · cohesion 0.07

## Key Concepts

- **calls.py** (23 connections) — `backend/app/routes/calls.py`
- **telecmi_cdr()** (11 connections) — `backend/app/routes/calls.py`
- **set_outcome()** (11 connections) — `backend/app/routes/calls.py`
- **_run_summarization()** (9 connections) — `backend/app/routes/calls.py`
- **score_from_outcome()** (9 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/call_scorer.py`
- **recompute_caller_score()** (9 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/call_scorer.py`
- **_verify_telecmi_webhook_secret()** (7 connections) — `backend/app/routes/calls.py`
- **str** (7 connections) — `backend/app/routes/calls.py`
- **backfill_summaries()** (7 connections) — `backend/app/routes/calls.py`
- **telecmi_live_events()** (6 connections) — `backend/app/routes/calls.py`
- **_process_telecmi_recording()** (6 connections) — `backend/app/routes/calls.py`
- **generate_summary()** (6 connections) — `backend/app/routes/calls.py`
- **next_lead()** (6 connections) — `backend/app/routes/calls.py`
- **_extract_call_log_id()** (5 connections) — `backend/app/routes/calls.py`
- **_effective_score()** (5 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/call_scorer.py`
- **get_call_log()** (4 connections) — `backend/app/routes/calls.py`
- **delete_call_log()** (4 connections) — `backend/app/routes/calls.py`
- **OutcomeUpdate** (3 connections) — `backend/app/routes/calls.py`
- **Request** (3 connections) — `backend/app/routes/calls.py`
- **recent_by_leads()** (3 connections) — `backend/app/routes/calls.py`
- **UUID** (3 connections) — `backend/app/routes/calls.py`
- **call_scorer.py** (3 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/call_scorer.py`
- **float** (3 connections) — `/Users/prem/Documents/Aira Ai/backend/app/services/call_scorer.py`
- **float** (3 connections) — `backend/app/services/call_scorer.py`
- **bool** (2 connections) — `backend/app/routes/calls.py`
- *... and 21 more nodes in this community*

## Relationships

- [[Callers CRUD & Coaching]] (13 shared connections)
- [[Meta Cloud API Client]] (6 shared connections)
- [[Telecaller Assignment Engine]] (4 shared connections)
- [[Meta Cloud Service]] (2 shared connections)
- [[Growth Service]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Pydantic Schemas]] (1 shared connections)
- [[Assignment Service]] (1 shared connections)

## Source Files

- `/Users/prem/Documents/Aira Ai/backend/app/services/call_scorer.py`
- `backend/app/routes/calls.py`
- `backend/app/services/call_scorer.py`

## Audit Trail

- EXTRACTED: 147 (80%)
- INFERRED: 37 (20%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*