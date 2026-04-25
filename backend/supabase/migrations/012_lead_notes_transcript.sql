-- lead_notes: per-lead notes from telecallers
CREATE TABLE lead_notes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  caller_id uuid REFERENCES callers(id) ON DELETE SET NULL,
  call_log_id uuid REFERENCES call_logs(id) ON DELETE SET NULL,
  content text NOT NULL DEFAULT '',
  structured jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- structured shape: {course, budget, timeline, next_action, sentiment}
  is_pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_notes_lead_id ON lead_notes(lead_id);
CREATE INDEX idx_lead_notes_is_pinned ON lead_notes(lead_id, is_pinned) WHERE is_pinned = true;

-- Add transcript + ai_summary to call_logs for Gemini post-call processing
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS transcript text,
  ADD COLUMN IF NOT EXISTS ai_summary jsonb;
