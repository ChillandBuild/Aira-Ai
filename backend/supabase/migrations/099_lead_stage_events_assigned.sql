-- Add 'assigned' and 'reassigned' to lead_stage_events event_type check constraint.
-- Powers the telecaller Assignment Log (proof that a lead was handed to a caller).
alter table lead_stage_events
  drop constraint if exists lead_stage_events_event_type_check;

alter table lead_stage_events
  add constraint lead_stage_events_event_type_check
  check (event_type in (
    'created', 'segment_changed', 'manual_update', 'converted',
    'call_outcome', 'score_updated', 'assigned', 'reassigned'
  ));

-- Index the assignment-event lookups the Assignment Log filters on.
create index if not exists idx_lead_stage_events_assigned
  on lead_stage_events (tenant_id, created_at desc)
  where event_type in ('assigned', 'reassigned');

-- Behaviour-preserving backfill. Auto-assign is now driven by the single switch
-- telecalling_config.enabled (was the legacy round_robin_enabled flag, default ON).
-- Tenants that had round_robin_enabled='true' but never set telecalling_config would
-- otherwise silently lose auto-assign (telecalling_config.enabled defaults to false).
-- Seed them with enabled + Hot-only / WhatsApp defaults to keep their prior behaviour.
insert into app_settings (tenant_id, key, value, is_secret)
select rr.tenant_id, 'telecalling_config',
       '{"enabled": true, "segments": ["A"], "channels": ["whatsapp"]}', false
from app_settings rr
where rr.key = 'round_robin_enabled'
  and lower(rr.value) = 'true'
  and not exists (
    select 1 from app_settings tc
    where tc.tenant_id = rr.tenant_id and tc.key = 'telecalling_config'
  )
on conflict (tenant_id, key) do nothing;
