# Instagram Channel

> 12 nodes · cohesion 0.21

## Key Concepts

- **instagram_webhook()** (18 connections) — `backend/app/routes/instagram.py`
- **config.py** (11 connections) — `backend/app/config.py`
- **instagram.py** (5 connections) — `backend/app/routes/instagram.py`
- **verify_instagram_webhook()** (5 connections) — `backend/app/routes/instagram.py`
- **test_instagram.py** (3 connections) — `backend/tests/test_instagram.py`
- **Settings** (2 connections) — `backend/app/config.py`
- **str** (2 connections) — `backend/app/routes/instagram.py`
- **Request** (2 connections) — `backend/app/routes/instagram.py`
- **test_verify_instagram_webhook_success()** (2 connections) — `backend/tests/test_instagram.py`
- **test_instagram_webhook_new_lead()** (2 connections) — `backend/tests/test_instagram.py`
- **BaseSettings** (1 connections)
- **BackgroundTasks** (1 connections) — `backend/app/routes/instagram.py`

## Relationships

- [[App Entry & Schedulers]] (3 shared connections)
- [[Facebook / Webhook Verification]] (3 shared connections)
- [[Knowledge Base (pgvector RAG)]] (2 shared connections)
- [[Template Submission (Meta)]] (2 shared connections)
- [[Leads & Conversations API]] (2 shared connections)
- [[Telecaller Assignment Engine]] (2 shared connections)
- [[Booking Flow]] (2 shared connections)
- [[App Settings & Telecalling Config]] (1 shared connections)
- [[Calls API (TeleCMI dialer)]] (1 shared connections)
- [[WhatsApp Inbound Webhook]] (1 shared connections)
- [[AI Reply Pipeline (Groq)]] (1 shared connections)
- [[Score Engine v2 & Segmentation]] (1 shared connections)

## Source Files

- `backend/app/config.py`
- `backend/app/routes/instagram.py`
- `backend/tests/test_instagram.py`

## Audit Trail

- EXTRACTED: 37 (69%)
- INFERRED: 17 (31%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*