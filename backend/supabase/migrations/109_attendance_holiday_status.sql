-- 109_attendance_holiday_status.sql
-- Allow 'holiday' as a valid attendance override status, in addition to
-- present/absent, so admins can mark team-wide holidays.

alter table public.caller_attendance_overrides
  drop constraint if exists caller_attendance_overrides_status_check;

alter table public.caller_attendance_overrides
  add constraint caller_attendance_overrides_status_check
  check (status in ('present', 'absent', 'holiday'));
