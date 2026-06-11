# Upload API

> 13 nodes · cohesion 0.18

## Key Concepts

- **_segment_to_flags()** (9 connections) — `backend/app/routes/upload.py`
- **download_tag_csv()** (7 connections) — `backend/app/routes/upload.py`
- **download_all_tags_csv()** (7 connections) — `backend/app/routes/upload.py`
- **_collect_successful_tag_segment_rows()** (7 connections) — `backend/app/routes/upload.py`
- **download_all_tags_combined()** (6 connections) — `backend/app/routes/upload.py`
- **int** (2 connections) — `backend/app/routes/upload.py`
- **Per-tag CSV grouped by broadcast: name, phone, template, broadcast_id, HOT, WARM** (1 connections) — `backend/app/routes/upload.py`
- **Download all-tags CSV grouped by tag then broadcast: name, phone, tag, template,** (1 connections) — `backend/app/routes/upload.py`
- **Combined CSV across all tags.      mode=all: simple concatenation of all tags (n** (1 connections) — `backend/app/routes/upload.py`
- **Return (HOT, WARM, COLD) flags. D (disqualified) → all zero.** (1 connections) — `backend/app/routes/upload.py`
- **Per-tag CSV grouped by broadcast.      Normal segment exports include only succe** (1 connections) — `backend/app/routes/upload.py`
- **Rows for tag exports: successful sends only, bucketed by current lead segment.** (1 connections) — `backend/app/routes/upload.py`
- **Download successful tag segment rows grouped by tag then broadcast.** (1 connections) — `backend/app/routes/upload.py`

## Relationships

- [[CSV Upload & Bulk Send]] (11 shared connections)
- [[Leads API]] (3 shared connections)
- [[Delivery Status Tracking]] (3 shared connections)

## Source Files

- `backend/app/routes/upload.py`

## Audit Trail

- EXTRACTED: 42 (93%)
- INFERRED: 3 (7%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*