-- Migration 077: broadcast_negative_reply_at on leads
-- Set when a lead explicitly rejects a broadcast (pattern-matched rejection → segment D).
-- Used by broadcast executor to suppress or warn before future sends.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS broadcast_negative_reply_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_broadcast_negative_reply
  ON leads(tenant_id, broadcast_negative_reply_at)
  WHERE broadcast_negative_reply_at IS NOT NULL;
