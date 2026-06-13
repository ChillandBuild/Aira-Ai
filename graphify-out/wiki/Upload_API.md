# Upload API

> 17 nodes · cohesion 0.13

## Key Concepts

- **_segment_to_flags()** (11 connections) — `backend/app/routes/upload.py`
- **_collect_successful_tag_segment_rows()** (9 connections) — `backend/app/routes/upload.py`
- **download_all_tags_csv()** (9 connections) — `backend/app/routes/upload.py`
- **download_all_tags_combined()** (8 connections) — `backend/app/routes/upload.py`
- **Rows for tag exports: successful sends only, bucketed by current lead segment.** (1 connections) — `backend/app/routes/upload.py`
- **Download successful tag segment rows grouped by tag then broadcast.** (1 connections) — `backend/app/routes/upload.py`
- **Combined CSV across all tags.      mode=all: simple concatenation of all tags (n** (1 connections) — `backend/app/routes/upload.py`
- **Return (HOT, WARM, COLD) flags. D (disqualified) → all zero.** (1 connections) — `backend/app/routes/upload.py`
- **Rows for tag exports: successful sends only, bucketed by current lead segment.** (1 connections) — `backend/app/routes/upload.py`
- **Download successful tag segment rows grouped by tag then broadcast.** (1 connections) — `backend/app/routes/upload.py`
- **Combined CSV across all tags.      mode=all: simple concatenation of all tags (n** (1 connections) — `backend/app/routes/upload.py`
- **Return (HOT, WARM, COLD) flags. D (disqualified) → all zero.** (1 connections) — `backend/app/routes/upload.py`
- **Download all-tags CSV grouped by tag then broadcast: name, phone, tag, template,** (1 connections) — `backend/app/routes/upload.py`
- **Combined CSV across all tags.      mode=all: simple concatenation of all tags (n** (1 connections) — `backend/app/routes/upload.py`
- **Return (HOT, WARM, COLD) flags. D (disqualified) → all zero.** (1 connections) — `backend/app/routes/upload.py`
- **Rows for tag exports: successful sends only, bucketed by current lead segment.** (1 connections) — `backend/app/routes/upload.py`
- **Download successful tag segment rows grouped by tag then broadcast.** (1 connections) — `backend/app/routes/upload.py`

## Relationships

- [[Upload API]] (10 shared connections)
- [[CSV Upload & Bulk Send]] (2 shared connections)
- [[Callers CRUD & Coaching]] (2 shared connections)

## Source Files

- `backend/app/routes/upload.py`

## Audit Trail

- EXTRACTED: 48 (96%)
- INFERRED: 2 (4%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*