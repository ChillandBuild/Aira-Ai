# Quality Failover

> 6 nodes · cohesion 0.40

## Key Concepts

- **str** (4 connections) — `backend/app/services/failover.py`
- **update_number_quality()** (3 connections) — `backend/app/services/failover.py`
- **handle_quality_red()** (2 connections) — `backend/app/services/failover.py`
- **handle_quality_yellow()** (2 connections) — `backend/app/services/failover.py`
- **send_migration_notice()** (2 connections) — `backend/app/services/failover.py`
- **int** (2 connections) — `backend/app/services/failover.py`

## Relationships

- [[WhatsApp Inbound Webhook]] (3 shared connections)

## Source Files

- `backend/app/services/failover.py`

## Audit Trail

- EXTRACTED: 12 (80%)
- INFERRED: 3 (20%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*