create or replace function increment_phone_daily_send_count(row_id uuid, delta integer default 1)
returns void as $$
  update phone_numbers set daily_send_count = daily_send_count + delta where id = row_id;
$$ language sql;
