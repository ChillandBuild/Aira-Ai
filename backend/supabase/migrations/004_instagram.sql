-- Instagram support: ig_user_id as alternate identity for leads
alter table leads
  add column if not exists ig_user_id text,
  alter column phone drop not null;

create unique index if not exists uq_leads_ig_user_id
  on leads(ig_user_id) where ig_user_id is not null;

-- Ensure at least one of (phone, ig_user_id) is set
alter table leads
  add constraint leads_needs_identity
  check (phone is not null or ig_user_id is not null) not valid;
