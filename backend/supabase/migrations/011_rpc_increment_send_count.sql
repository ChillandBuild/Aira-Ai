-- Atomic increment for phone number daily send count (avoids read-modify-write race)
create or replace function increment_phone_daily_send_count(row_id uuid)
returns void as $$
  update phone_numbers set daily_send_count = daily_send_count + 1 where id = row_id;
$$ language sql;
