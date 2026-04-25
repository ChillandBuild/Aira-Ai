-- Per-segment message templates (Action Boxes)
create table if not exists segment_templates (
  id uuid primary key default uuid_generate_v4(),
  segment text not null unique check (segment in ('A', 'B', 'C', 'D')),
  message text not null default '',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create trigger segment_templates_updated_at
  before update on segment_templates
  for each row execute function update_updated_at();

insert into segment_templates (segment, message, enabled) values
  ('A', '', true),
  ('B', '', true),
  ('C', '', true),
  ('D', '', true)
on conflict (segment) do nothing;
