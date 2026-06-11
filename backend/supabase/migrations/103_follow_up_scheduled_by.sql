-- Record which caller scheduled a manual callback, so the Scheduled Calls Board
-- can show "Scheduled by <name>" instead of a generic placeholder.
-- Automation-created callbacks leave this NULL → rendered as "Auto-scheduled".
ALTER TABLE follow_up_jobs
  ADD COLUMN IF NOT EXISTS scheduled_by_caller_id uuid REFERENCES callers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_follow_up_jobs_scheduled_by
  ON follow_up_jobs(scheduled_by_caller_id);
