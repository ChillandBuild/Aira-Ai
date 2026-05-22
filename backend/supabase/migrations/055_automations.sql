-- Automations engine: trigger-based workflow automation
-- Runs alongside follow_up_jobs (no replacement)

CREATE TABLE IF NOT EXISTS automations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'lead_created', 'first_inbound_message', 'new_message_received',
        'keyword_match', 'segment_changed'
    )),
    trigger_config  JSONB NOT NULL DEFAULT '{}',
    active          BOOLEAN NOT NULL DEFAULT false,
    run_count       INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL,
    step_type       TEXT NOT NULL CHECK (step_type IN (
        'send_message', 'send_template', 'assign_lead',
        'update_segment', 'add_note', 'send_webhook',
        'wait', 'condition'
    )),
    config          JSONB NOT NULL DEFAULT '{}',
    parent_step_id  UUID REFERENCES automation_steps(id) ON DELETE CASCADE,
    branch          TEXT CHECK (branch IN ('yes', 'no')),
    position        INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    lead_id         UUID REFERENCES leads(id) ON DELETE SET NULL,
    tenant_id       UUID NOT NULL,
    trigger_type    TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'success'
                        CHECK (status IN ('success', 'partial', 'failure')),
    steps_results   JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_pending_executions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    lead_id         UUID REFERENCES leads(id) ON DELETE CASCADE,
    resume_step_id  UUID REFERENCES automation_steps(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL,
    run_at          TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'done', 'failed')),
    context         JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automations_tenant_active
    ON automations(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_automation_steps_automation
    ON automation_steps(automation_id, position);
CREATE INDEX IF NOT EXISTS idx_automation_logs_tenant
    ON automation_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_automation
    ON automation_logs(automation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_executions_run_at
    ON automation_pending_executions(run_at) WHERE status = 'pending';
