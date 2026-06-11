-- Caller's self-rating of how the call went (1-5), captured at wrap-up time.
ALTER TABLE call_logs ADD COLUMN IF NOT EXISTS quality_rating smallint;

ALTER TABLE call_logs DROP CONSTRAINT IF EXISTS call_logs_quality_rating_check;
ALTER TABLE call_logs ADD CONSTRAINT call_logs_quality_rating_check
  CHECK (quality_rating IS NULL OR quality_rating BETWEEN 1 AND 5);
