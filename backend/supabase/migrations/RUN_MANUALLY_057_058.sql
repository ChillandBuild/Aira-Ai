-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/tovmebyyjhvszwgvyfdm/sql)
-- Then restart the backend

-- Migration 057: Scheduled broadcasts
CREATE TABLE IF NOT EXISTS scheduled_broadcasts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    template_name   TEXT NOT NULL,
    schedule_type   TEXT NOT NULL CHECK (schedule_type IN ('scheduled', 'drip')),
    fire_at         TIMESTAMPTZ NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'running', 'done', 'failed')),
    leads_json      JSONB NOT NULL DEFAULT '[]',
    variable_mapping JSONB DEFAULT '[]',
    opt_in_source   TEXT,
    csv_file_url    TEXT,
    csv_file_name   TEXT,
    result          JSONB,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    executed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS scheduled_broadcasts_fire_idx
    ON scheduled_broadcasts (fire_at, status)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS scheduled_broadcasts_tenant_idx
    ON scheduled_broadcasts (tenant_id, created_at DESC);

-- Migration 058: Broadcast fail reason
ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS fail_reason text;
