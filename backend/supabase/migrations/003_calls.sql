-- Telecalling extensions: call status + twilio sid + per-call score
alter table call_logs
  add column if not exists status text not null default 'initiated'
    check (status in ('initiated', 'in_progress', 'completed', 'failed', 'no_answer')),
  add column if not exists twilio_call_sid text,
  add column if not exists score numeric(3,1);

create index if not exists idx_call_logs_caller_id on call_logs(caller_id);
create index if not exists idx_call_logs_lead_id on call_logs(lead_id);
create unique index if not exists uq_call_logs_twilio_sid
  on call_logs(twilio_call_sid) where twilio_call_sid is not null;

-- Storage bucket for call recordings (public read).
insert into storage.buckets (id, name, public)
values ('call-recordings', 'call-recordings', true)
on conflict (id) do nothing;
