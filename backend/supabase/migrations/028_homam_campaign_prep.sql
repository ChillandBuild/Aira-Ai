-- 028_homam_campaign_prep.sql
-- Mark uploaded leads that have no opt-in source as offline_event attendees.
-- These are contacts from previous Homam/event attendance or temple enquiries.
-- This enables bulk utility template sends (not marketing) to them.

UPDATE leads
SET opt_in_source = 'offline_event'
WHERE opt_in_source IS NULL
  AND source = 'upload'
  AND deleted_at IS NULL;

-- Also update 'manual' leads that were uploaded (not manually created via telecaller)
-- Only if they have no call history — pure upload contacts misclassified as manual
UPDATE leads
SET opt_in_source = 'offline_event'
WHERE opt_in_source = 'manual'
  AND source = 'upload'
  AND deleted_at IS NULL
  AND id NOT IN (
    SELECT DISTINCT lead_id FROM call_logs WHERE lead_id IS NOT NULL
  );
