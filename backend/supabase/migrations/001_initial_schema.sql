-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- leads: one row per contact/potential student
create table if not exists leads (
  id uuid primary key default uuid_generate_v4(),
  phone text not null unique,
  name text,
  source text not null check (source in ('whatsapp', 'instagram', 'upload')),
  score integer not null default 5 check (score >= 1 and score <= 10),
  segment text not null default 'C' check (segment in ('A', 'B', 'C', 'D')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- conversations: one per lead interaction session
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'closed')),
  channel text not null default 'whatsapp',
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

-- messages: every inbound and outbound message
create table if not exists messages (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null default 'whatsapp',
  content text not null,
  is_ai_generated boolean not null default false,
  twilio_message_sid text,
  created_at timestamptz not null default now()
);

-- faqs: pre-seeded Q&A pairs for token-efficient replies
create table if not exists faqs (
  id uuid primary key default uuid_generate_v4(),
  question text not null,
  answer text not null,
  keywords text[] not null default '{}',
  hit_count integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- callers: telecaller profiles
create table if not exists callers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  phone_extension text,
  overall_score numeric(3,1) default 7.0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- call_logs: every manual call record
create table if not exists call_logs (
  id uuid primary key default uuid_generate_v4(),
  lead_id uuid not null references leads(id) on delete cascade,
  caller_id uuid references callers(id) on delete set null,
  duration_seconds integer,
  recording_url text,
  outcome text check (outcome in ('converted', 'callback', 'not_interested', 'no_answer')),
  notes text,
  created_at timestamptz not null default now()
);

-- ad_campaigns: track social media spend vs conversions
create table if not exists ad_campaigns (
  id uuid primary key default uuid_generate_v4(),
  platform text not null check (platform in ('instagram', 'facebook', 'google')),
  campaign_name text not null,
  external_campaign_id text,
  spend_inr numeric(10,2) default 0,
  lead_count integer default 0,
  conversion_count integer default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- updated_at trigger for leads
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();

-- indexes for common query patterns
create index if not exists idx_messages_lead_id on messages(lead_id);
create index if not exists idx_messages_created_at on messages(created_at desc);
create index if not exists idx_leads_segment on leads(segment);
create index if not exists idx_leads_score on leads(score desc);
create index if not exists idx_conversations_lead_id on conversations(lead_id);
