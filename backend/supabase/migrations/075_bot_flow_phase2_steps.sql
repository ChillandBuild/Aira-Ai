-- Widen automation_steps.step_type CHECK for Phase-2 + Agent block types.
-- These were added in application code (_VALID_STEPS) but the DB CHECK (last set in
-- migration 073) still only allowed the Phase-1 list — saving any flow using them
-- would raise a 23514 check violation. Idempotent drop-and-re-add.

ALTER TABLE automation_steps
    DROP CONSTRAINT IF EXISTS automation_steps_step_type_check;
ALTER TABLE automation_steps
    ADD CONSTRAINT automation_steps_step_type_check CHECK (step_type IN (
        'send_message', 'send_template', 'assign_lead',
        'update_segment', 'add_note', 'send_webhook',
        'wait', 'condition', 'create_followup',
        'send_image', 'send_video', 'send_file', 'send_location', 'cta_url',
        'user_input', 'interactive', 'http_api', 'random', 'ai_agent'
    ));
