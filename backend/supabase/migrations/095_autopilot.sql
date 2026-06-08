-- 095_autopilot.sql
-- Autopilot: tenant-opt-in autonomous conversation agent that owns the full inbound
-- conversation per lead (qualify -> reply -> book / escalate / disqualify / done).
-- Completely separate from the bot-flow and automations engines. OFF by default,
-- gated per-tenant via app_settings.autopilot_enabled = 'true'. When off, the inbound
-- pipeline runs byte-for-byte as before.

CREATE TABLE IF NOT EXISTS autopilot_runs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL,
    lead_id       uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    channel       text NOT NULL DEFAULT 'whatsapp',
    status        text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'escalated', 'done', 'disqualified')),
    variables     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- agent state bag (history, turns)
    turn_count    int   NOT NULL DEFAULT 0,
    last_outcome  text,
    locked_at     timestamptz,                          -- per-lead drive lock (stale after 60s)
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- At most one active run per lead per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_autopilot_runs_active
    ON autopilot_runs (tenant_id, lead_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_autopilot_runs_lead
    ON autopilot_runs (tenant_id, lead_id);

-- Autopilot replies are recorded in messages with reply_source = 'autopilot' so the
-- existing reply-source badge can distinguish them. Extend the existing CHECK constraint.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_reply_source_check;
ALTER TABLE messages ADD CONSTRAINT messages_reply_source_check
    CHECK (reply_source IN ('knowledge', 'ai', 'automation', 'autopilot'));

