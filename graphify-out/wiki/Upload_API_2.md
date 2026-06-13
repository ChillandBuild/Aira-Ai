# Upload API

> 14 nodes · cohesion 0.25

## Key Concepts

- **upload.py** (38 connections) — `backend/app/routes/upload.py`
- **bulk_send()** (17 connections) — `backend/app/routes/upload.py`
- **_create_csv_signed_url()** (6 connections) — `backend/app/routes/upload.py`
- **get_csv_signed_url()** (6 connections) — `backend/app/routes/upload.py`
- **_validate_csv_storage_path()** (5 connections) — `backend/app/routes/upload.py`
- **_meta_error_detail()** (4 connections) — `backend/app/routes/upload.py`
- **OptInRequest** (3 connections) — `backend/app/routes/upload.py`
- **BulkSendRequest** (3 connections) — `backend/app/routes/upload.py`
- **_retry_fields()** (3 connections) — `backend/app/routes/upload.py`
- **BulkLeadItem** (2 connections) — `backend/app/routes/upload.py`
- **_insert_scheduled_broadcast()** (2 connections) — `backend/app/routes/upload.py`
- **_insert_scheduled_broadcasts()** (2 connections) — `backend/app/routes/upload.py`
- **validate_optin()** (2 connections) — `backend/app/routes/upload.py`
- **Human-readable Meta error for the failed CSV — '(#code) message', else trimmed r** (1 connections) — `backend/app/routes/upload.py`

## Relationships

- [[Upload API]] (32 shared connections)
- [[Meta Cloud API Client]] (4 shared connections)
- [[Pydantic Schemas]] (3 shared connections)
- [[CSV Upload & Bulk Send]] (2 shared connections)
- [[Callers CRUD & Coaching]] (2 shared connections)
- [[Broadcast Executor & Outbound Router]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)

## Source Files

- `backend/app/routes/upload.py`

## Audit Trail

- EXTRACTED: 86 (91%)
- INFERRED: 8 (9%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*