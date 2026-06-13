# Meta Cloud Service

> 21 nodes · cohesion 0.16

## Key Concepts

- **get_setting()** (34 connections) — `backend/app/config_dynamic.py`
- **UpdateTemplate** (16 connections) — `backend/app/routes/templates.py`
- **CreateTemplate** (11 connections) — `backend/app/routes/templates.py`
- **update_template()** (11 connections) — `backend/app/routes/templates.py`
- **submit_template()** (10 connections) — `backend/app/services/meta_cloud.py`
- **create_template()** (9 connections) — `backend/app/routes/templates.py`
- **_strip_emojis()** (9 connections) — `backend/app/services/meta_cloud.py`
- **_build_button_components()** (9 connections) — `backend/app/services/meta_cloud.py`
- **_sanitize_header_or_footer()** (7 connections) — `backend/app/services/meta_cloud.py`
- **_extract_variable_examples()** (7 connections) — `backend/app/services/meta_cloud.py`
- **test_create_template_uses_waba_id_not_phone_number_id()** (4 connections) — `/Users/prem/Documents/Aira Ai/backend/tests/test_templates.py`
- **Edit a REJECTED or PAUSED template. Updates local DB and pushes changes to Meta** (2 connections) — `backend/app/routes/templates.py`
- **Update a rejected/paused template on Meta.     Calls POST https://graph.facebook** (2 connections) — `backend/app/services/meta_cloud.py`
- **Read from cache → app_settings table → env var → fallback.** (1 connections) — `backend/app/config_dynamic.py`
- **Drop emoji code points (and ZWJ / variation selectors) from a string.** (1 connections) — `backend/app/services/meta_cloud.py`
- **Meta rejects newlines, formatting characters, and emojis in HEADER/FOOTER     te** (1 connections) — `backend/app/services/meta_cloud.py`
- **Return placeholder example values for every {{N}} variable in the body.** (1 connections) — `backend/app/services/meta_cloud.py`
- **Shared button-component builder used by main template + carousel cards.** (1 connections) — `backend/app/services/meta_cloud.py`
- **create_template must read meta_waba_id, not meta_phone_number_id.** (1 connections) — `/Users/prem/Documents/Aira Ai/backend/tests/test_templates.py`
- **Return placeholder example values for every {{N}} variable in the body.** (1 connections) — `backend/app/services/meta_cloud.py`
- **Shared button-component builder used by main template + carousel cards.** (1 connections) — `backend/app/services/meta_cloud.py`

## Relationships

- [[Meta Cloud API Client]] (24 shared connections)
- [[Templates API]] (14 shared connections)
- [[Callers CRUD & Coaching]] (5 shared connections)
- [[Ai Reply Service]] (3 shared connections)
- [[Tests: Reengagement Service]] (3 shared connections)
- [[Calls API (TeleCMI dialer)]] (2 shared connections)
- [[Pydantic Schemas]] (2 shared connections)
- [[App Settings API]] (1 shared connections)
- [[Facebook / Webhook Verification]] (1 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[Assignment Service]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)

## Source Files

- `/Users/prem/Documents/Aira Ai/backend/tests/test_templates.py`
- `backend/app/config_dynamic.py`
- `backend/app/routes/templates.py`
- `backend/app/services/meta_cloud.py`

## Audit Trail

- EXTRACTED: 87 (63%)
- INFERRED: 52 (37%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*