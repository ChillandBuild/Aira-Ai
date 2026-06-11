# App Settings API

> 24 nodes · cohesion 0.14

## Key Concepts

- **app_settings.py** (16 connections) — `backend/app/routes/app_settings.py`
- **str** (10 connections) — `backend/app/routes/app_settings.py`
- **TelecallingConfigPanel.tsx** (10 connections) — `frontend/app/dashboard/settings/TelecallingConfigPanel.tsx`
- **get_inbox_config()** (9 connections) — `backend/app/services/assignment.py`
- **update_settings()** (8 connections) — `backend/app/routes/app_settings.py`
- **activate_channel()** (8 connections) — `backend/app/routes/app_settings.py`
- **setup_telegram_webhook()** (6 connections) — `backend/app/routes/app_settings.py`
- **patch_inbox_config()** (6 connections) — `backend/app/routes/app_settings.py`
- **patch_telecalling_config()** (6 connections) — `backend/app/routes/app_settings.py`
- **WebhookHealth** (4 connections) — `frontend/app/dashboard/channels/page.tsx`
- **SettingsUpdate** (3 connections) — `backend/app/routes/app_settings.py`
- **ActivateChannelRequest** (3 connections) — `backend/app/routes/app_settings.py`
- **InboxConfigUpdate** (3 connections) — `backend/app/routes/app_settings.py`
- **_get_setting_value()** (3 connections) — `backend/app/routes/app_settings.py`
- **list_settings()** (3 connections) — `backend/app/routes/app_settings.py`
- **bool** (1 connections) — `backend/app/routes/app_settings.py`
- **Register Telegram webhook + return generated secret (None if base_url missing).** (1 connections) — `backend/app/routes/app_settings.py`
- **Return last inbound event timestamp per channel + recent token_invalid incidents** (1 connections) — `backend/app/routes/app_settings.py`
- **Validate Meta credentials and auto-subscribe webhook for whatsapp / instagram /** (1 connections) — `backend/app/routes/app_settings.py`
- **Return inbox_config from app_settings, merged with defaults.** (1 connections) — `backend/app/services/assignment.py`
- **DEFAULT** (1 connections) — `frontend/app/dashboard/settings/TelecallingConfigPanel.tsx`
- **SEGMENT_LABELS** (1 connections) — `frontend/app/dashboard/settings/TelecallingConfigPanel.tsx`
- **CHANNEL_LABELS** (1 connections) — `frontend/app/dashboard/settings/TelecallingConfigPanel.tsx`
- **toggle()** (1 connections) — `frontend/app/dashboard/settings/TelecallingConfigPanel.tsx`

## Relationships

- [[Telecaller Assignment Engine]] (7 shared connections)
- [[Pydantic Schemas]] (4 shared connections)
- [[Leads API]] (4 shared connections)
- [[Reengagement API]] (4 shared connections)
- [[Channels Page]] (2 shared connections)
- [[Operator Console & Audit]] (2 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)
- [[Templates API]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)
- [[Bot Flow / Automation Engine]] (1 shared connections)
- [[API Client (frontend)]] (1 shared connections)

## Source Files

- `backend/app/routes/app_settings.py`
- `backend/app/services/assignment.py`
- `frontend/app/dashboard/channels/page.tsx`
- `frontend/app/dashboard/settings/TelecallingConfigPanel.tsx`

## Audit Trail

- EXTRACTED: 88 (82%)
- INFERRED: 19 (18%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*