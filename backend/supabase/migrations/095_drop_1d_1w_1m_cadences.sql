-- Migration 095: Drop 1d/1w/1m follow-up cadences
-- The new reengagement_steps engine (migration 094) supersedes the legacy
-- 1d/1w/1m follow-up cadences, which sent freeform text outside the
-- WhatsApp 24h session window. callback cadence is preserved for
-- operator-scheduled telecaller reminders.

ALTER TABLE follow_up_jobs DROP CONSTRAINT IF EXISTS follow_up_jobs_cadence_check;
ALTER TABLE follow_up_jobs ADD CONSTRAINT follow_up_jobs_cadence_check
  CHECK (cadence IN ('callback'));

UPDATE follow_up_jobs
   SET status = 'canceled',
       skip_reason = 'cadence_retired:1d/1w/1m removed in 095'
 WHERE status = 'pending' AND cadence IN ('1d', '1w', '1m');
