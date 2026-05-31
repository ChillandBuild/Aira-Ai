-- Bot Flow Builder: extends the existing automations schema (migration 055)
-- in place. No tables are renamed. Widens step_type / branch CHECKs, adds
-- per-node delivery counters, flow_kind + subscriber_count on automations,
-- and links outbound messages back to the automation node that sent them.
-- All statements are idempotent.

-- 1. automation_steps -------------------------------------------------------

-- Widen step_type CHECK to allow new bot-flow node types (keep existing ones)
ALTER TABLE automation_steps
    DROP CONSTRAINT IF EXISTS automation_steps_step_type_check;
ALTER TABLE automation_steps
    ADD CONSTRAINT automation_steps_step_type_check CHECK (step_type IN (
        'send_message', 'send_template', 'assign_lead',
        'update_segment', 'add_note', 'send_webhook',
        'wait', 'condition', 'create_followup',
        'send_image', 'send_video', 'send_file',
        'send_location', 'cta_url'
    ));

-- Per-node delivery counters
ALTER TABLE automation_steps
    ADD COLUMN IF NOT EXISTS sent_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automation_steps
    ADD COLUMN IF NOT EXISTS delivered_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE automation_steps
    ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0;

-- Relax branch CHECK to permit arbitrary short labels for future multi-way branching
ALTER TABLE automation_steps
    DROP CONSTRAINT IF EXISTS automation_steps_branch_check;
ALTER TABLE automation_steps
    ADD CONSTRAINT automation_steps_branch_check CHECK (branch IS NULL OR length(branch) <= 40);

-- 2. automations ------------------------------------------------------------

ALTER TABLE automations
    ADD COLUMN IF NOT EXISTS subscriber_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE automations
    ADD COLUMN IF NOT EXISTS flow_kind TEXT NOT NULL DEFAULT 'automation';
ALTER TABLE automations
    DROP CONSTRAINT IF EXISTS automations_flow_kind_check;
ALTER TABLE automations
    ADD CONSTRAINT automations_flow_kind_check CHECK (flow_kind IN ('automation', 'bot_flow'));

-- 3. messages ---------------------------------------------------------------

-- Link outbound flow messages to the automation node that sent them
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS automation_id UUID REFERENCES automations(id) ON DELETE SET NULL;
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS automation_step_id UUID REFERENCES automation_steps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_automation_step
    ON messages(automation_step_id) WHERE automation_step_id IS NOT NULL;

-- 4. atomic per-node counter increment --------------------------------------
-- PostgREST cannot express `col = col + 1`; the executor and webhook call this.
-- p_field is whitelisted to the three counter columns.
CREATE OR REPLACE FUNCTION bump_automation_step_counter(
    p_step_id UUID,
    p_field   TEXT,
    p_delta   INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
    IF p_field NOT IN ('sent_count', 'delivered_count', 'error_count') THEN
        RAISE EXCEPTION 'invalid counter field: %', p_field;
    END IF;
    EXECUTE format(
        'UPDATE automation_steps SET %I = %I + $1 WHERE id = $2',
        p_field, p_field
    ) USING p_delta, p_step_id;
END;
$$ LANGUAGE plpgsql;
