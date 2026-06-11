# Notifications API

> 5 nodes · cohesion 0.40

## Key Concepts

- **list_notifications()** (4 connections) — `backend/app/routes/notifications.py`
- **mark_notification_read()** (4 connections) — `backend/app/routes/notifications.py`
- **str** (2 connections) — `backend/app/routes/notifications.py`
- **Fetch unread notifications for the current user.** (1 connections) — `backend/app/routes/notifications.py`
- **Mark a specific notification as read.** (1 connections) — `backend/app/routes/notifications.py`

## Relationships

- [[Leads API]] (2 shared connections)
- [[Notes Page]] (2 shared connections)

## Source Files

- `backend/app/routes/notifications.py`

## Audit Trail

- EXTRACTED: 10 (83%)
- INFERRED: 2 (17%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*