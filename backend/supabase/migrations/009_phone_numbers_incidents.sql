-- phone_numbers: WhatsApp number pool management
create table if not exists phone_numbers (
  id uuid primary key default uuid_generate_v4(),
  provider text not null check (provider in ('meta_cloud', 'wati')),
  number text not null unique,
  display_name text not null,
  meta_phone_number_id text,         -- Meta's internal phone number ID
  role text not null default 'standby' check (role in ('primary', 'standby', 'archived')),
  status text not null default 'warming' check (status in ('active', 'warming', 'restricted', 'archived')),
  quality_rating text not null default 'green' check (quality_rating in ('green', 'yellow', 'red')),
  messaging_tier integer not null default 1000 check (messaging_tier in (1000, 10000, 100000)),
  daily_send_count integer not null default 0,
  warm_up_day integer not null default 0 check (warm_up_day >= 0 and warm_up_day <= 14),
  api_key text,                      -- WATI api key (null for meta_cloud)
  paused_outbound boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger phone_numbers_updated_at
  before update on phone_numbers
  for each row execute function update_updated_at();

create index if not exists idx_phone_numbers_status on phone_numbers(status);
create index if not exists idx_phone_numbers_role on phone_numbers(role);

-- incidents: auto-action timeline log
create table if not exists incidents (
  id uuid primary key default uuid_generate_v4(),
  type text not null check (type in (
    'quality_yellow', 'quality_red', 'failover',
    'migration_sent', 'appeal_filed', 'standby_promoted', 'warm_up_complete'
  )),
  phone_number_id uuid references phone_numbers(id) on delete set null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_incidents_created_at on incidents(created_at desc);
create index if not exists idx_incidents_phone_number_id on incidents(phone_number_id);
