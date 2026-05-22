-- Extend automation constraints to include score_threshold trigger + create_followup step
ALTER TABLE automations DROP CONSTRAINT IF EXISTS automations_trigger_type_check;
ALTER TABLE automations ADD CONSTRAINT automations_trigger_type_check
  CHECK (trigger_type IN (
    'lead_created', 'first_inbound_message', 'new_message_received',
    'keyword_match', 'segment_changed', 'score_threshold'
  ));

ALTER TABLE automation_steps DROP CONSTRAINT IF EXISTS automation_steps_step_type_check;
ALTER TABLE automation_steps ADD CONSTRAINT automation_steps_step_type_check
  CHECK (step_type IN (
    'send_message', 'send_template', 'assign_lead',
    'update_segment', 'add_note', 'send_webhook',
    'wait', 'condition', 'create_followup'
  ));
