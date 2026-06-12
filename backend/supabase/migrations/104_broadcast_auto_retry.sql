-- Migration 104: Broadcast auto-retry
-- Re-send a broadcast's undelivered leads (Meta marketing-cap 131049 + silent drops)
-- at a client-chosen wall-clock time, up to a client-chosen number of attempts.
--
-- A "retry chain" = original broadcast + child re-send attempts, linked by retry_of.
-- Each retry attempt is a child scheduled_broadcasts row picked up by the existing
-- _process_scheduled_broadcasts job (no executor changes). app_settings.timezone is a
-- key/value row, not a column — no DDL needed there.

-- Retry config lives on the ORIGINAL broadcast row (retry_of IS NULL).
ALTER TABLE scheduled_broadcasts
    ADD COLUMN IF NOT EXISTS retry_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS retry_time         TIME,                       -- wall-clock, tenant tz
    ADD COLUMN IF NOT EXISTS retry_max_attempts INTEGER     NOT NULL DEFAULT 2,
    ADD COLUMN IF NOT EXISTS retry_of           UUID,                       -- parent broadcast_id; NULL on original
    ADD COLUMN IF NOT EXISTS retry_attempt      INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS retry_completed_at TIMESTAMPTZ;                 -- chain terminal marker

-- Orchestrator lookup: originals with retries enabled that haven't completed.
CREATE INDEX IF NOT EXISTS scheduled_broadcasts_retry_active_idx
    ON scheduled_broadcasts (tenant_id, executed_at)
    WHERE retry_enabled = TRUE AND retry_of IS NULL AND retry_completed_at IS NULL;

-- Walk a chain's attempts cheaply.
CREATE INDEX IF NOT EXISTS scheduled_broadcasts_retry_of_idx
    ON scheduled_broadcasts (retry_of, retry_attempt)
    WHERE retry_of IS NOT NULL;

-- Personalization values per recipient so retries can rebuild the exact message
-- (immediate broadcasts store empty leads_json, so this is the only carrier).
ALTER TABLE broadcast_recipients
    ADD COLUMN IF NOT EXISTS extra_cols JSONB;
