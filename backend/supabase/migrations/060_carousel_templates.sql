-- 060_carousel_templates.sql
-- Add carousel support to message_templates. carousel_cards is JSONB:
-- [{ "header_media_url": "...", "header_media_type": "IMAGE", "body_text": "...",
--    "buttons": [{ "type": "URL", "text": "Shop", "url": "..." }] }, ...]
-- Up to 10 cards per Meta spec.

ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS carousel_cards JSONB;
