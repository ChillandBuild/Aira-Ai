-- Migration 047: Add media and structured buttons support to message_templates

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS header_media_type TEXT,
  ADD COLUMN IF NOT EXISTS header_media_url TEXT,
  ADD COLUMN IF NOT EXISTS buttons JSONB;
