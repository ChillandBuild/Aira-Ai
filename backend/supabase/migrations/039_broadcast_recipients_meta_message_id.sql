-- Migration 039: Add meta_message_id to broadcast_recipients
-- Purpose: Scope message delivery queries to exact broadcast, preventing cross-broadcast contamination

ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS meta_message_id text;
CREATE INDEX IF NOT EXISTS idx_br_meta_msg ON broadcast_recipients(meta_message_id);
