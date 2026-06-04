-- Migration 086: Freeze mechanism for per-broadcast scores
-- Adds finalized_at so broadcast executor can mark a broadcast's score slate
-- as frozen when the next broadcast is sent to that lead (per-lead freeze).
ALTER TABLE broadcast_lead_scores ADD COLUMN IF NOT EXISTS finalized_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_bls_unfinalized
  ON broadcast_lead_scores(lead_id)
  WHERE finalized_at IS NULL;
