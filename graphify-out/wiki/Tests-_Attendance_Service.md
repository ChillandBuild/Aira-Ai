# Tests: Attendance Service

> 39 nodes · cohesion 0.08

## Key Concepts

- **team.py** (10 connections) — `backend/app/routes/team.py`
- **resolve_day_status()** (10 connections) — `backend/app/services/attendance.py`
- **date_range()** (8 connections) — `backend/app/services/attendance.py`
- **build_attendance_map()** (8 connections) — `backend/app/services/attendance.py`
- **get_team_attendance()** (7 connections) — `backend/app/routes/team.py`
- **get_caller_attendance()** (7 connections) — `backend/app/routes/team.py`
- **mark_attendance()** (5 connections) — `backend/app/routes/team.py`
- **attendance.py** (5 connections) — `backend/app/services/attendance.py`
- **compute_team_summary()** (5 connections) — `backend/app/services/attendance.py`
- **test_attendance_service.py** (5 connections) — `backend/tests/test_attendance_service.py`
- **TestResolveDayStatus** (5 connections) — `backend/tests/test_attendance_service.py`
- **invite_member()** (4 connections) — `backend/app/routes/team.py`
- **remove_member()** (4 connections) — `backend/app/routes/team.py`
- **str** (4 connections) — `backend/app/routes/team.py`
- **InvitePayload** (3 connections) — `backend/app/routes/team.py`
- **AttendancePayload** (3 connections) — `backend/app/routes/team.py`
- **list_team()** (3 connections) — `backend/app/routes/team.py`
- **date** (3 connections) — `backend/app/services/attendance.py`
- **str** (3 connections) — `backend/app/services/attendance.py`
- **TestDateRange** (3 connections) — `backend/tests/test_attendance_service.py`
- **.test_combines_overrides_and_activity()** (3 connections) — `backend/tests/test_attendance_service.py`
- **get_me()** (2 connections) — `backend/app/routes/team.py`
- **.test_future_date_returns_future()** (2 connections) — `backend/tests/test_attendance_service.py`
- **.test_override_wins_over_activity()** (2 connections) — `backend/tests/test_attendance_service.py`
- **.test_derives_present_from_activity()** (2 connections) — `backend/tests/test_attendance_service.py`
- *... and 14 more nodes in this community*

## Relationships

- [[Callers CRUD & Coaching]] (7 shared connections)
- [[Meta Cloud API Client]] (6 shared connections)
- [[Pydantic Schemas]] (2 shared connections)
- [[App Entry & Schedulers]] (1 shared connections)

## Source Files

- `backend/app/routes/team.py`
- `backend/app/services/attendance.py`
- `backend/tests/test_attendance_service.py`

## Audit Trail

- EXTRACTED: 95 (70%)
- INFERRED: 41 (30%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*