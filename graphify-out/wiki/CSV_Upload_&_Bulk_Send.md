# CSV Upload & Bulk Send

> 31 nodes · cohesion 0.14

## Key Concepts

- **upload.py** (33 connections) — `backend/app/routes/upload.py`
- **str** (25 connections) — `backend/app/routes/upload.py`
- **bulk_send()** (14 connections) — `backend/app/routes/upload.py`
- **upload_leads()** (12 connections) — `backend/app/routes/upload.py`
- **_normalize_phone()** (7 connections) — `backend/app/routes/upload.py`
- **parse_csv()** (7 connections) — `backend/app/routes/upload.py`
- **_to_float()** (6 connections) — `backend/app/routes/upload.py`
- **risk_audit()** (6 connections) — `backend/app/routes/upload.py`
- **clear_negative_reply()** (6 connections) — `backend/app/routes/upload.py`
- **_create_csv_signed_url()** (6 connections) — `backend/app/routes/upload.py`
- **get_csv_signed_url()** (6 connections) — `backend/app/routes/upload.py`
- **_clean_text()** (5 connections) — `backend/app/routes/upload.py`
- **_validate_csv_storage_path()** (5 connections) — `backend/app/routes/upload.py`
- **_map_meta_error()** (4 connections) — `backend/app/routes/upload.py`
- **_value_for()** (4 connections) — `backend/app/routes/upload.py`
- **RiskAuditRequest** (4 connections) — `backend/app/routes/upload.py`
- **get_broadcast_history()** (4 connections) — `backend/app/routes/upload.py`
- **download_broadcast_scores_csv()** (4 connections) — `backend/app/routes/upload.py`
- **download_broadcast_history_csv()** (4 connections) — `backend/app/routes/upload.py`
- **OptInRequest** (3 connections) — `backend/app/routes/upload.py`
- **BulkSendRequest** (3 connections) — `backend/app/routes/upload.py`
- **UploadFile** (2 connections) — `backend/app/routes/upload.py`
- **validate_optin()** (2 connections) — `backend/app/routes/upload.py`
- **_insert_scheduled_broadcast()** (2 connections) — `backend/app/routes/upload.py`
- **float** (1 connections) — `backend/app/routes/upload.py`
- *... and 6 more nodes in this community*

## Relationships

- [[Upload API]] (11 shared connections)
- [[Leads API]] (10 shared connections)
- [[Reengagement API]] (6 shared connections)
- [[Pydantic Schemas]] (4 shared connections)
- [[Delivery Status Tracking]] (4 shared connections)
- [[Follow-ups & Callback Scheduling API]] (2 shared connections)
- [[Broadcast Executor & Outbound Router]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Booking Flow]] (1 shared connections)
- [[Meta Cloud API Client]] (1 shared connections)

## Source Files

- `backend/app/routes/upload.py`

## Audit Trail

- EXTRACTED: 159 (88%)
- INFERRED: 22 (12%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*