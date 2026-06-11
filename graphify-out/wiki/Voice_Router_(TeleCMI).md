# Voice Router (TeleCMI)

> 12 nodes · cohesion 0.18

## Key Concepts

- **InitiateCall** (8 connections) — `backend/app/routes/calls.py`
- **initiate_click2call()** (4 connections) — `backend/app/services/telecmi_client.py`
- **str** (4 connections) — `backend/app/services/voice_router.py`
- **str** (2 connections) — `backend/app/services/telecmi_client.py`
- **get_best_voice_number()** (2 connections) — `backend/app/services/voice_router.py`
- **increment_voice_call_count()** (2 connections) — `backend/app/services/voice_router.py`
- **update_pickup_rate()** (2 connections) — `backend/app/services/voice_router.py`
- **Any** (1 connections) — `backend/app/services/telecmi_client.py`
- **bool** (1 connections) — `backend/app/services/telecmi_client.py`
- **_normalize_phone()** (1 connections) — `backend/app/services/telecmi_client.py`
- **report_spam_flag()** (1 connections) — `backend/app/services/voice_router.py`
- **bool** (1 connections) — `backend/app/services/voice_router.py`

## Relationships

- [[Templates API]] (1 shared connections)
- [[Leads API]] (1 shared connections)
- [[Pydantic Schemas]] (1 shared connections)
- [[Calls API (TeleCMI dialer)]] (1 shared connections)
- [[Reengagement API]] (1 shared connections)

## Source Files

- `backend/app/routes/calls.py`
- `backend/app/services/telecmi_client.py`
- `backend/app/services/voice_router.py`

## Audit Trail

- EXTRACTED: 21 (72%)
- INFERRED: 8 (28%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*