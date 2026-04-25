alter table leads
  add column if not exists ai_enabled boolean not null default true,
  add column if not exists ad_campaign_id uuid references ad_campaigns(id) on delete set null,
  add column if not exists external_ad_id text,
  add column if not exists external_ad_set_id text,
  add column if not exists ad_name text,
  add column if not exists ad_set_name text,
  add column if not exists utm_source text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text;

alter table ad_campaigns
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'ad_campaigns_updated_at'
  ) then
    create trigger ad_campaigns_updated_at
      before update on ad_campaigns
      for each row execute function update_updated_at();
  end if;
end $$;

create table if not exists lead_stage_events (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  from_segment text check (from_segment in ('A', 'B', 'C', 'D')),
  to_segment text not null check (to_segment in ('A', 'B', 'C', 'D')),
  event_type text not null check (
    event_type in ('created', 'segment_changed', 'manual_update', 'converted', 'call_outcome')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_stage_events_lead_id on lead_stage_events(lead_id);
create index if not exists idx_lead_stage_events_created_at on lead_stage_events(created_at desc);

create table if not exists follow_up_jobs (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  channel text not null default 'whatsapp',
  cadence text not null check (cadence in ('1d', '1w', '1m')),
  status text not null default 'pending' check (
    status in ('pending', 'sent', 'skipped', 'canceled', 'failed')
  ),
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  message_preview text,
  skip_reason text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'follow_up_jobs_updated_at'
  ) then
    create trigger follow_up_jobs_updated_at
      before update on follow_up_jobs
      for each row execute function update_updated_at();
  end if;
end $$;

create index if not exists idx_follow_up_jobs_status_schedule
  on follow_up_jobs(status, scheduled_for);

create unique index if not exists uq_follow_up_jobs_pending_cadence
  on follow_up_jobs(lead_id, cadence)
  where status = 'pending';

create index if not exists idx_leads_ad_campaign_id on leads(ad_campaign_id);
