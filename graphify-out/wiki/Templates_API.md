# Templates API

> 23 nodes · cohesion 0.13

## Key Concepts

- **templates.py** (20 connections) — `backend/app/routes/templates.py`
- **TemplateContentExistsError** (13 connections) — `backend/app/services/meta_cloud.py`
- **str** (12 connections) — `backend/app/routes/templates.py`
- **sync_template_status()** (8 connections) — `backend/app/routes/templates.py`
- **sync_templates_from_meta()** (8 connections) — `backend/app/routes/templates.py`
- **template_status_webhook()** (7 connections) — `backend/app/routes/templates.py`
- **delete_template()** (6 connections) — `backend/app/routes/templates.py`
- **update_template_variations()** (5 connections) — `backend/app/routes/templates.py`
- **VariationsPayload** (4 connections) — `backend/app/routes/templates.py`
- **get_template_variations()** (4 connections) — `backend/app/routes/templates.py`
- **Button** (3 connections) — `backend/app/routes/templates.py`
- **CarouselCard** (3 connections) — `backend/app/routes/templates.py`
- **list_templates()** (3 connections) — `backend/app/routes/templates.py`
- **Request** (2 connections) — `backend/app/routes/templates.py`
- **UploadFile** (2 connections) — `backend/app/routes/templates.py`
- **Pull current status from Meta API and update the local record.** (1 connections) — `backend/app/routes/templates.py`
- **Pull all templates from Meta and upsert into local DB. Returns added/updated cou** (1 connections) — `backend/app/routes/templates.py`
- **Meta calls this when template status changes (APPROVED/REJECTED). No auth.** (1 connections) — `backend/app/routes/templates.py`
- **Raised when Meta rejects template creation because name+language already exists.** (1 connections) — `backend/app/services/meta_cloud.py`
- **Pull current status from Meta API and update the local record.** (1 connections) — `backend/app/routes/templates.py`
- **Pull all templates from Meta and upsert into local DB. Returns added/updated cou** (1 connections) — `backend/app/routes/templates.py`
- **Meta calls this when template status changes (APPROVED/REJECTED). No auth.** (1 connections) — `backend/app/routes/templates.py`
- **Raised when Meta rejects template creation because name+language already exists.** (1 connections) — `backend/app/services/meta_cloud.py`

## Relationships

- [[Meta Cloud Service]] (14 shared connections)
- [[Meta Cloud API Client]] (13 shared connections)
- [[Callers CRUD & Coaching]] (7 shared connections)
- [[Pydantic Schemas]] (3 shared connections)
- [[Analytics Page]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Templates Page]] (1 shared connections)

## Source Files

- `backend/app/routes/templates.py`
- `backend/app/services/meta_cloud.py`

## Audit Trail

- EXTRACTED: 77 (71%)
- INFERRED: 31 (29%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*