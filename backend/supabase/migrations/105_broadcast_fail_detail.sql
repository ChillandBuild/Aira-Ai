-- Migration 105: human-readable failure detail on broadcast recipients
-- fail_reason holds a short code; fail_detail holds the raw Meta error message
-- (e.g. "(#131058) Hello World templates can only be sent from the Public Test
-- Numbers") so the failed-CSV is self-diagnosing instead of a generic "api_error".
ALTER TABLE broadcast_recipients
    ADD COLUMN IF NOT EXISTS fail_detail TEXT;
