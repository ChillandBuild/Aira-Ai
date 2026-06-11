# Telegram Channel

> 12 nodes · cohesion 0.18

## Key Concepts

- **telegram_webhook()** (17 connections) — `backend/app/routes/telegram.py`
- **fire_trigger()** (8 connections) — `backend/app/services/automation_triggers.py`
- **telegram.py** (3 connections) — `backend/app/routes/telegram.py`
- **_dispatch()** (2 connections) — `backend/app/services/automation_triggers.py`
- **str** (2 connections) — `backend/app/services/automation_triggers.py`
- **bool** (2 connections) — `backend/app/services/automation_triggers.py`
- **test_telegram.py** (2 connections) — `backend/tests/test_telegram.py`
- **test_telegram_webhook_new_lead()** (2 connections) — `backend/tests/test_telegram.py`
- **str** (1 connections) — `backend/app/routes/telegram.py`
- **Request** (1 connections) — `backend/app/routes/telegram.py`
- **BackgroundTasks** (1 connections) — `backend/app/routes/telegram.py`
- **BackgroundTasks** (1 connections) — `backend/app/services/automation_triggers.py`

## Relationships

- [[Leads API]] (3 shared connections)
- [[Templates API]] (2 shared connections)
- [[App Entry & Schedulers]] (2 shared connections)
- [[Telecaller Assignment Engine]] (2 shared connections)
- [[Booking Flow]] (2 shared connections)
- [[Reengagement API]] (1 shared connections)
- [[Autopilot & AI Agent Runtime]] (1 shared connections)
- [[Flow Runtime (pause/resume)]] (1 shared connections)
- [[Facebook / Webhook Verification]] (1 shared connections)
- [[Instagram Channel]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)

## Source Files

- `backend/app/routes/telegram.py`
- `backend/app/services/automation_triggers.py`
- `backend/tests/test_telegram.py`

## Audit Trail

- EXTRACTED: 24 (57%)
- INFERRED: 18 (43%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*