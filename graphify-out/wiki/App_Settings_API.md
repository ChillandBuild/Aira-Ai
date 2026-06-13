# App Settings API

> 58 nodes · cohesion 0.05

## Key Concepts

- **app_settings.py** (20 connections) — `backend/app/routes/app_settings.py`
- **operator.py** (13 connections) — `backend/app/routes/operator.py`
- **TelecallingConfigPanel.tsx** (12 connections) — `frontend/app/dashboard/settings/TelecallingConfigPanel.tsx`
- **get_inbox_config()** (11 connections) — `backend/app/services/assignment.py`
- **record_audit_event()** (11 connections) — `backend/app/services/audit_log.py`
- **str** (10 connections) — `backend/app/routes/app_settings.py`
- **update_settings()** (8 connections) — `backend/app/routes/app_settings.py`
- **activate_channel()** (8 connections) — `backend/app/routes/app_settings.py`
- **wipe_leads()** (8 connections) — `backend/app/routes/operator.py`
- **setup_telegram_webhook()** (7 connections) — `backend/app/routes/app_settings.py`
- **patch_telecalling_config()** (7 connections) — `backend/app/routes/app_settings.py`
- **patch_inbox_config()** (6 connections) — `backend/app/routes/app_settings.py`
- **update_features()** (6 connections) — `backend/app/routes/operator.py`
- **update_status()** (6 connections) — `backend/app/routes/operator.py`
- **operator_me()** (5 connections) — `backend/app/routes/operator.py`
- **create_client()** (5 connections) — `backend/app/routes/operator.py`
- **reset_password()** (5 connections) — `backend/app/routes/operator.py`
- **CreateClientPayload** (4 connections) — `backend/app/routes/operator.py`
- **str** (4 connections) — `backend/app/routes/operator.py`
- **WebhookHealth** (4 connections) — `frontend/app/dashboard/channels/page.tsx`
- **SettingsUpdate** (3 connections) — `backend/app/routes/app_settings.py`
- **ActivateChannelRequest** (3 connections) — `backend/app/routes/app_settings.py`
- **InboxConfigUpdate** (3 connections) — `backend/app/routes/app_settings.py`
- **TelecallingConfigUpdate** (3 connections) — `backend/app/routes/app_settings.py`
- **_get_setting_value()** (3 connections) — `backend/app/routes/app_settings.py`
- *... and 33 more nodes in this community*

## Relationships

- [[Callers CRUD & Coaching]] (13 shared connections)
- [[Meta Cloud API Client]] (10 shared connections)
- [[Telecaller Assignment Engine]] (8 shared connections)
- [[Pydantic Schemas]] (8 shared connections)
- [[App Entry & Schedulers]] (2 shared connections)
- [[Authrolecontext (frontend)]] (2 shared connections)
- [[API Client (frontend)]] (2 shared connections)
- [[Meta Cloud Service]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)
- [[Channels Page]] (1 shared connections)
- [[Api (frontend)]] (1 shared connections)
- [[Notes Api (frontend)]] (1 shared connections)

## Source Files

- `backend/app/routes/app_settings.py`
- `backend/app/routes/operator.py`
- `backend/app/services/assignment.py`
- `backend/app/services/audit_log.py`
- `frontend/app/dashboard/channels/page.tsx`
- `frontend/app/dashboard/settings/TelecallingConfigPanel.tsx`

## Audit Trail

- EXTRACTED: 176 (79%)
- INFERRED: 48 (21%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*