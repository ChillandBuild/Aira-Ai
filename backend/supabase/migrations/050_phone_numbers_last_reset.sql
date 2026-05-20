-- Track when each phone number's daily counter was last reset
-- Used by the manual Sync from Meta endpoint to calculate elapsed days
alter table phone_numbers
  add column if not exists last_reset_at timestamptz;
