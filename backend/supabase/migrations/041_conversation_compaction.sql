-- 041_conversation_compaction.sql
-- Add compaction tracking to lead_conversation_state for context-aware scoring

ALTER TABLE lead_conversation_state
  ADD COLUMN IF NOT EXISTS message_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS conversation_summary text,
  ADD COLUMN IF NOT EXISTS last_compacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS summary_version integer NOT NULL DEFAULT 0;

-- Index for inactivity queries
CREATE INDEX IF NOT EXISTS idx_conv_state_last_activity 
  ON lead_conversation_state (last_activity_at);

COMMENT ON COLUMN lead_conversation_state.message_count IS 'Triggers compaction at 10 messages';
COMMENT ON COLUMN lead_conversation_state.last_activity_at IS 'Used for 6hr session reset detection';
COMMENT ON COLUMN lead_conversation_state.conversation_summary IS 'AI-generated summary, retained across sessions';
