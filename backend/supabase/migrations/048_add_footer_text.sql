-- Migration 048: Add footer_text column to message_templates

ALTER TABLE message_templates
  ADD COLUMN IF NOT EXISTS footer_text TEXT;
