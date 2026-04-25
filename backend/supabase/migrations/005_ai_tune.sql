-- AI Auto-Tune: closed-deal analysis mutates the reply system prompt
alter table leads
  add column if not exists converted_at timestamptz,
  add column if not exists conversion_notes text;

create table if not exists ai_prompts (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  content text not null,
  updated_at timestamptz not null default now()
);

create trigger ai_prompts_updated_at
  before update on ai_prompts
  for each row execute function update_updated_at();

create table if not exists ai_tune_suggestions (
  id uuid primary key default uuid_generate_v4(),
  for_prompt text not null,
  suggestion text not null,
  rationale text,
  status text not null default 'pending'
    check (status in ('pending','applied','rejected')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_tune_suggestions_status
  on ai_tune_suggestions(status, created_at desc);
