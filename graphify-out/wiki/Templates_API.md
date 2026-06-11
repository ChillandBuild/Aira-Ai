# Templates API

> 25 nodes · cohesion 0.14

## Key Concepts

- **get_setting()** (27 connections) — `backend/app/config_dynamic.py`
- **templates.py** (19 connections) — `backend/app/routes/templates.py`
- **TemplateContentExistsError** (12 connections) — `backend/app/services/meta_cloud.py`
- **upload_template_media()** (12 connections) — `backend/app/routes/templates.py`
- **str** (10 connections) — `backend/app/routes/templates.py`
- **CreateTemplate** (9 connections) — `backend/app/routes/templates.py`
- **config_dynamic.py** (7 connections) — `backend/app/config_dynamic.py`
- **sync_template_status()** (7 connections) — `backend/app/routes/templates.py`
- **sync_templates_from_meta()** (7 connections) — `backend/app/routes/templates.py`
- **delete_template()** (6 connections) — `backend/app/routes/templates.py`
- **template_status_webhook()** (6 connections) — `backend/app/routes/templates.py`
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
- **Upload a media file for use in template headers. Returns the Meta header_handle.** (1 connections) — `backend/app/routes/templates.py`
- **Upload media for template headers using Meta's Resumable Upload API.      Step 1** (1 connections) — `backend/app/services/meta_cloud.py`

## Relationships

- [[Meta Cloud API Client]] (10 shared connections)
- [[Reengagement API]] (9 shared connections)
- [[Leads API]] (8 shared connections)
- [[Meta Cloud Service]] (7 shared connections)
- [[Autopilot & AI Agent Runtime]] (4 shared connections)
- [[AI Reply Pipeline (Groq)]] (4 shared connections)
- [[Pydantic Schemas]] (4 shared connections)
- [[Calls API (TeleCMI dialer)]] (3 shared connections)
- [[Facebook / Webhook Verification]] (3 shared connections)
- [[Instagram Channel]] (2 shared connections)
- [[Telegram Channel]] (2 shared connections)
- [[Booking Flow]] (2 shared connections)

## Source Files

- `backend/app/config_dynamic.py`
- `backend/app/routes/templates.py`
- `backend/app/services/meta_cloud.py`

## Audit Trail

- EXTRACTED: 106 (69%)
- INFERRED: 48 (31%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*