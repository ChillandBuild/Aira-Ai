-- Migration 097: Re-engagement backup template + fallback log status
-- Purpose: A freeform step can carry a backup approved template that is sent
-- when a lead's 24h window is closed at fire time, instead of skipping the lead.

ALTER TABLE public.reengagement_steps
  ADD COLUMN IF NOT EXISTS fallback_template_name text,
  ADD COLUMN IF NOT EXISTS fallback_template_variables jsonb;

-- Allow the engine to record fallback sends distinctly.
ALTER TABLE public.reengagement_logs
  DROP CONSTRAINT IF EXISTS reengagement_logs_status_check;

ALTER TABLE public.reengagement_logs
  ADD CONSTRAINT reengagement_logs_status_check
  CHECK (status IN ('sent', 'failed', 'skipped_window', 'sent_fallback'));
