-- Score Engine v2: three-signal composite scoring
-- score = clamp(score_arc + score_intent_delta + score_engagement_delta, 1, 10)
--
-- score_arc            : LLM verdict on the full conversation (updated every 3 msgs)
-- score_intent_delta   : rule-based instant signal from the current message (-3..+3)
-- score_engagement_delta: time-decay applied by scheduler (-4..0)
-- arc_message_count    : inbound messages since last arc scoring (resets after arc call)
-- last_inbound_at      : timestamp of most recent inbound message (drives engagement decay)
-- segment_drop_count   : consecutive messages that proposed a lower segment (segment lock)

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS score_arc               integer DEFAULT 5
    CHECK (score_arc BETWEEN 1 AND 10),
  ADD COLUMN IF NOT EXISTS score_intent_delta      integer DEFAULT 0
    CHECK (score_intent_delta BETWEEN -3 AND 3),
  ADD COLUMN IF NOT EXISTS score_engagement_delta  integer DEFAULT 0
    CHECK (score_engagement_delta BETWEEN -4 AND 0),
  ADD COLUMN IF NOT EXISTS arc_message_count       integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_inbound_at         timestamptz,
  ADD COLUMN IF NOT EXISTS segment_drop_count      integer DEFAULT 0
    CHECK (segment_drop_count BETWEEN 0 AND 3);

-- Seed existing leads: carry current score into arc baseline
UPDATE leads SET score_arc = score WHERE score_arc = 5 AND score != 5;

-- Index for engagement decay job (queries by last_inbound_at)
CREATE INDEX IF NOT EXISTS idx_leads_last_inbound_at
  ON leads(tenant_id, last_inbound_at)
  WHERE deleted_at IS NULL;
