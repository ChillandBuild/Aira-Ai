-- Daily coaching digest per telecaller
-- One row per caller per day — stores aggregate stats + AI coaching report
CREATE TABLE IF NOT EXISTS caller_digests (
    id              UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id       UUID         NOT NULL,
    caller_id       UUID         NOT NULL,
    digest_date     DATE         NOT NULL,
    call_count      INTEGER      NOT NULL DEFAULT 0,
    stats           JSONB,       -- { total, converted, callbacks, not_interested, avg_duration, avg_score }
    coaching_report TEXT,        -- AI-generated narrative coaching text
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    UNIQUE (caller_id, digest_date)
);

CREATE INDEX IF NOT EXISTS idx_caller_digests_caller_date
    ON caller_digests (caller_id, digest_date DESC);

CREATE INDEX IF NOT EXISTS idx_caller_digests_tenant_date
    ON caller_digests (tenant_id, digest_date DESC);
