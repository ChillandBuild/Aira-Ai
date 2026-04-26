alter table leads add column if not exists deleted_at timestamptz;
create index if not exists idx_leads_deleted_at on leads(deleted_at) where deleted_at is null;
