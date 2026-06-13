# Notifications API

> 8 nodes · cohesion 0.25

## Key Concepts

- **list_pool_items()** (5 connections) — `backend/app/routes/notifications.py`
- **list_notifications()** (4 connections) — `backend/app/routes/notifications.py`
- **mark_notification_read()** (4 connections) — `backend/app/routes/notifications.py`
- **str** (3 connections) — `backend/app/routes/notifications.py`
- **Fetch unread notifications for the current user.** (1 connections) — `backend/app/routes/notifications.py`
- **Mark a specific notification as read.** (1 connections) — `backend/app/routes/notifications.py`
- **Currently-actionable shared-pool items for the claim banner.      Reflects live** (1 connections) — `backend/app/routes/notifications.py`
- **Currently-actionable shared-pool items for the claim banner.      Reflects live** (1 connections) — `backend/app/routes/notifications.py`

## Relationships

- [[Callers CRUD & Coaching]] (3 shared connections)
- [[Notes Api (frontend)]] (3 shared connections)

## Source Files

- `backend/app/routes/notifications.py`

## Audit Trail

- EXTRACTED: 17 (85%)
- INFERRED: 3 (15%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*