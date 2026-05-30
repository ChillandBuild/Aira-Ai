-- Bot Flow Builder Phase 2: durable, resumable run-state.
-- Replaces the broken wait-resume in automation_pending_executions (which re-walked
-- from root and never read resume_step_id). One run-state subsumes time-waits AND
-- reply-waits. automation_pending_executions is retired (left in place, unused).

CREATE TABLE IF NOT EXISTS automation_flow_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    automation_id   UUID NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
    lead_id         UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    tenant_id       UUID NOT NULL,
    status          TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'waiting_time', 'waiting_reply', 'done', 'failed')),
    current_step_id UUID REFERENCES automation_steps(id) ON DELETE SET NULL,
    variables       JSONB NOT NULL DEFAULT '{}',
    resume_at       TIMESTAMPTZ,
    trigger_message TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cron pickup of due time-waits
CREATE INDEX IF NOT EXISTS idx_flow_runs_waiting_time
    ON automation_flow_runs(resume_at) WHERE status = 'waiting_time';

-- Inbound lookup: is this lead waiting on a flow reply?
CREATE INDEX IF NOT EXISTS idx_flow_runs_waiting_reply
    ON automation_flow_runs(lead_id, automation_id) WHERE status = 'waiting_reply';

-- At most one active run per (lead, automation). Partial unique over active states.
CREATE UNIQUE INDEX IF NOT EXISTS idx_flow_runs_one_active
    ON automation_flow_runs(lead_id, automation_id)
    WHERE status IN ('running', 'waiting_time', 'waiting_reply');

CREATE INDEX IF NOT EXISTS idx_flow_runs_tenant
    ON automation_flow_runs(tenant_id, created_at DESC);
