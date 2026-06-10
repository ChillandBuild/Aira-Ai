# Calls API (TeleCMI dialer)

> 38 nodes · cohesion 0.08

## Key Concepts

- **calls.py** (21 connections) — `backend/app/routes/calls.py`
- **set_outcome()** (11 connections) — `backend/app/routes/calls.py`
- **telecmi_cdr()** (10 connections) — `backend/app/routes/calls.py`
- **_verify_telecmi_webhook_secret()** (7 connections) — `backend/app/routes/calls.py`
- **_run_summarization()** (7 connections) — `backend/app/routes/calls.py`
- **str** (6 connections) — `backend/app/routes/calls.py`
- **next_lead()** (6 connections) — `backend/app/routes/calls.py`
- **telecmi_live_events()** (5 connections) — `backend/app/routes/calls.py`
- **_process_telecmi_recording()** (5 connections) — `backend/app/routes/calls.py`
- **backfill_summaries()** (5 connections) — `backend/app/routes/calls.py`
- **score_from_outcome()** (5 connections) — `backend/app/services/call_scorer.py`
- **recompute_caller_score()** (5 connections) — `backend/app/services/call_scorer.py`
- **_extract_call_log_id()** (4 connections) — `backend/app/routes/calls.py`
- **delete_call_log()** (4 connections) — `backend/app/routes/calls.py`
- **str** (4 connections) — `backend/app/services/call_summarizer.py`
- **get_call_log()** (4 connections) — `backend/app/routes/calls.py`
- **OutcomeUpdate** (3 connections) — `backend/app/routes/calls.py`
- **Request** (3 connections) — `backend/app/routes/calls.py`
- **recent_by_leads()** (3 connections) — `backend/app/routes/calls.py`
- **float** (3 connections) — `backend/app/services/call_scorer.py`
- **UUID** (3 connections) — `backend/app/routes/calls.py`
- **BackgroundTasks** (2 connections) — `backend/app/routes/calls.py`
- **stats_today()** (2 connections) — `backend/app/routes/calls.py`
- **str** (2 connections) — `backend/app/services/call_scorer.py`
- **transcribe_recording()** (2 connections) — `backend/app/services/call_summarizer.py`
- *... and 13 more nodes in this community*

## Relationships

- [[Leads & Conversations API]] (14 shared connections)
- [[Reengagement & Tenant]] (5 shared connections)
- [[Telecaller Assignment Engine]] (4 shared connections)
- [[Template Submission (Meta)]] (3 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Voice Router (TeleCMI)]] (1 shared connections)
- [[Pydantic Schemas]] (1 shared connections)
- [[Follow-ups & Callback Scheduling API]] (1 shared connections)

## Source Files

- `backend/app/routes/calls.py`
- `backend/app/services/call_scorer.py`
- `backend/app/services/call_summarizer.py`

## Audit Trail

- EXTRACTED: 110 (75%)
- INFERRED: 37 (25%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*