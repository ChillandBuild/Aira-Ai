-- BotBiz block types: add send_audio, send_list, add_label, send_catalog
-- to the automation_steps step_type check constraint.

ALTER TABLE automation_steps
    DROP CONSTRAINT IF EXISTS automation_steps_step_type_check;

ALTER TABLE automation_steps
    ADD CONSTRAINT automation_steps_step_type_check CHECK (step_type IN (
        'send_message', 'send_template', 'assign_lead',
        'update_segment', 'add_note', 'send_webhook',
        'wait', 'condition', 'create_followup',
        'send_image', 'send_video', 'send_file', 'send_location', 'cta_url',
        'user_input', 'http_api', 'random', 'interactive', 'ai_agent',
        'send_audio', 'send_list', 'add_label', 'send_catalog'
    ));
