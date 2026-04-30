-- Allow 'callback' as a cadence type for manual telecaller-scheduled callbacks
ALTER TABLE follow_up_jobs DROP CONSTRAINT IF EXISTS follow_up_jobs_cadence_check;
ALTER TABLE follow_up_jobs ADD CONSTRAINT follow_up_jobs_cadence_check
  CHECK (cadence IN ('1d', '1w', '1m', 'callback'));

-- Drop unique index that prevents multiple callbacks per lead
DROP INDEX IF EXISTS uq_follow_up_jobs_pending_cadence;

-- Re-create unique index only for non-callback cadences
CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_up_jobs_pending_cadence
  ON follow_up_jobs(lead_id, cadence)
  WHERE status = 'pending' AND cadence != 'callback';
