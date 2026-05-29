-- Add 'score_updated' to lead_stage_events event_type check constraint
alter table lead_stage_events
  drop constraint if exists lead_stage_events_event_type_check;

alter table lead_stage_events
  add constraint lead_stage_events_event_type_check
  check (event_type in ('created', 'segment_changed', 'manual_update', 'converted', 'call_outcome', 'score_updated'));
