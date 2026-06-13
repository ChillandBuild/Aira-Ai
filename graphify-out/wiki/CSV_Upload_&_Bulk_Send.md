# CSV Upload & Bulk Send

> 18 nodes · cohesion 0.16

## Key Concepts

- **_classify_broadcast_outcomes()** (12 connections) — `backend/app/routes/upload.py`
- **download_broadcast_tag_csv()** (11 connections) — `backend/app/routes/upload.py`
- **nearest_status()** (6 connections) — `backend/app/services/delivery_status.py`
- **delivery_status.py** (5 connections) — `backend/app/services/delivery_status.py`
- **parse_ts()** (5 connections) — `backend/app/services/delivery_status.py`
- **nearest_record()** (5 connections) — `backend/app/services/delivery_status.py`
- **datetime** (4 connections) — `backend/app/services/delivery_status.py`
- **str** (2 connections) — `backend/app/services/delivery_status.py`
- **Classify every recipient of one broadcast into sent / delivered / opened / faile** (1 connections) — `backend/app/routes/upload.py`
- **Per-broadcast segment CSV. OPTED_OUT exports a dedicated opted-out sheet.** (1 connections) — `backend/app/routes/upload.py`
- **Per-broadcast delivery attribution.  When the same lead receives multiple broadc** (1 connections) — `backend/app/services/delivery_status.py`
- **Return the record whose timestamp is nearest to `anchor` within the send     win** (1 connections) — `backend/app/services/delivery_status.py`
- **Delivery status of the message nearest the broadcast send, or None.** (1 connections) — `backend/app/services/delivery_status.py`
- **Classify every recipient of one broadcast into sent / delivered / opened / faile** (1 connections) — `backend/app/routes/upload.py`
- **Per-broadcast segment CSV. OPTED_OUT exports a dedicated opted-out sheet.** (1 connections) — `backend/app/routes/upload.py`
- **Classify every recipient of one broadcast into sent / delivered / opened / faile** (1 connections) — `backend/app/routes/upload.py`
- **Per-broadcast interest CSV: every recipient with their current segment as HOT/WA** (1 connections) — `backend/app/routes/upload.py`
- **Per-broadcast segment CSV. OPTED_OUT exports a dedicated opted-out sheet.** (1 connections) — `backend/app/routes/upload.py`

## Relationships

- [[Upload API]] (9 shared connections)
- [[Callers CRUD & Coaching]] (1 shared connections)

## Source Files

- `backend/app/routes/upload.py`
- `backend/app/services/delivery_status.py`

## Audit Trail

- EXTRACTED: 51 (85%)
- INFERRED: 9 (15%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*