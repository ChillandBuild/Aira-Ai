-- app_settings: key-value store for credentials and configuration
-- Readable/writable via /api/v1/settings endpoint
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text,
  is_secret boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value, is_secret) VALUES
  ('meta_access_token', null, true),
  ('meta_phone_number_id', null, false),
  ('meta_webhook_verify_token', null, true),
  ('twilio_account_sid', null, false),
  ('twilio_auth_token', null, true),
  ('gemini_api_key', null, true),
  ('ai_auto_reply_enabled', 'true', false),
  ('faq_match_threshold', '0.85', false)
ON CONFLICT (key) DO NOTHING;
