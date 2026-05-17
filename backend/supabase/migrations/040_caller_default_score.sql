-- Change default overall_score for new callers from 7.0 to 0.0
-- A brand-new caller with no calls should start at 0, not 7.
ALTER TABLE callers ALTER COLUMN overall_score SET DEFAULT 0.0;
