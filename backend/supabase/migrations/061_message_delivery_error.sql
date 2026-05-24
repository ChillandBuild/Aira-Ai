-- Migration 061: Capture Meta delivery error details on failed outbound messages
--
-- Until now we stored only delivery_status='failed' from the Meta status webhook
-- but threw away the rich error payload (code + title). That left every failed
-- broadcast row with a generic 'delivery_failed' reason — no way to tell whether
-- the number had no WhatsApp, the 24h window expired, the template was paused, etc.
--
-- These two columns let _classify_broadcast_outcomes surface the actual Meta
-- reason in the failed CSV. Both are nullable; older rows stay NULL.

ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_error_code int;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_error_title text;
