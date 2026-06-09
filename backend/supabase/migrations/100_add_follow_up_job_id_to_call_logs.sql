-- Migration 100: Add follow_up_job_id to call_logs
ALTER TABLE call_logs
  ADD COLUMN IF NOT EXISTS follow_up_job_id uuid REFERENCES follow_up_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_call_logs_follow_up_job_id ON call_logs(follow_up_job_id);
