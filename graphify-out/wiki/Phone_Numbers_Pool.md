# Phone Numbers Pool

> 9 nodes · cohesion 0.42

## Key Concepts

- **numbers.py** (7 connections) — `backend/app/routes/numbers.py`
- **UpdatePhoneNumber** (6 connections) — `backend/app/routes/numbers.py`
- **sync_number_from_meta()** (6 connections) — `backend/app/routes/numbers.py`
- **delete_phone_number()** (6 connections) — `backend/app/routes/numbers.py`
- **str** (5 connections) — `backend/app/routes/numbers.py`
- **CreatePhoneNumber** (4 connections) — `backend/app/routes/numbers.py`
- **UUID** (4 connections) — `backend/app/routes/numbers.py`
- **list_phone_numbers()** (3 connections) — `backend/app/routes/numbers.py`
- **Hard delete a phone number. FK on incidents.phone_number_id is ON     DELETE SET** (1 connections) — `backend/app/routes/numbers.py`

## Relationships

- [[Leads & Conversations API]] (5 shared connections)
- [[Reengagement & Tenant]] (3 shared connections)
- [[Pydantic Schemas]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)

## Source Files

- `backend/app/routes/numbers.py`

## Audit Trail

- EXTRACTED: 33 (79%)
- INFERRED: 9 (21%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*