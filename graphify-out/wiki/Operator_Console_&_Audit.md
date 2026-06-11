# Operator Console & Audit

> 19 nodes · cohesion 0.16

## Key Concepts

- **operator.py** (11 connections) — `backend/app/routes/operator.py`
- **record_audit_event()** (10 connections) — `backend/app/services/audit_log.py`
- **update_features()** (6 connections) — `backend/app/routes/operator.py`
- **update_status()** (6 connections) — `backend/app/routes/operator.py`
- **wipe_leads()** (6 connections) — `backend/app/routes/operator.py`
- **reset_password()** (5 connections) — `backend/app/routes/operator.py`
- **operator_me()** (4 connections) — `backend/app/routes/operator.py`
- **str** (4 connections) — `backend/app/routes/operator.py`
- **CreateClientPayload** (3 connections) — `backend/app/routes/operator.py`
- **UpdateFeaturesPayload** (3 connections) — `backend/app/routes/operator.py`
- **UpdateStatusPayload** (3 connections) — `backend/app/routes/operator.py`
- **_sanitize()** (3 connections) — `backend/app/services/audit_log.py`
- **list_clients()** (2 connections) — `backend/app/routes/operator.py`
- **audit_log.py** (2 connections) — `backend/app/services/audit_log.py`
- **Verify the caller is a system admin. No tenant required.** (1 connections) — `backend/app/routes/operator.py`
- **Delete all leads and lead-related data for a tenant. Irreversible.** (1 connections) — `backend/app/routes/operator.py`
- **Any** (1 connections) — `backend/app/services/audit_log.py`
- **str** (1 connections) — `backend/app/services/audit_log.py`
- **Best-effort append-only audit log.      Audit logging should never break the use** (1 connections) — `backend/app/services/audit_log.py`

## Relationships

- [[Leads API]] (6 shared connections)
- [[Reengagement API]] (5 shared connections)
- [[Pydantic Schemas]] (3 shared connections)
- [[Authrolecontext (frontend)]] (2 shared connections)
- [[App Settings API]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)

## Source Files

- `backend/app/routes/operator.py`
- `backend/app/services/audit_log.py`

## Audit Trail

- EXTRACTED: 52 (71%)
- INFERRED: 21 (29%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*