-- Migration 078: reply_sentiment on broadcast_recipients
-- Tracks per-lead reply quality for each broadcast so history can show
-- "of 100 sent: 8 positive, 2 negative, 10 neutral, 80 no reply".

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS reply_sentiment text
    CHECK (reply_sentiment IN ('positive', 'negative', 'neutral'));

CREATE INDEX IF NOT EXISTS idx_br_sentiment
  ON broadcast_recipients(broadcast_id, reply_sentiment)
  WHERE reply_sentiment IS NOT NULL;
