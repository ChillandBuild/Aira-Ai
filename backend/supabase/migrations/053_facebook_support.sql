-- Facebook Messenger support: fb_user_id as identity
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_user_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS fb_page_id text;

-- Unique index on fb_user_id per tenant
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_fb_user_id
  ON leads(fb_user_id, tenant_id) WHERE fb_user_id IS NOT NULL;

-- Update source constraint to include 'facebook'
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check
  CHECK (source IN ('whatsapp', 'instagram', 'upload', 'manual', 'telegram', 'facebook'));

-- Update identity constraint to allow fb_user_id as valid identity
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_needs_identity;
ALTER TABLE leads ADD CONSTRAINT leads_needs_identity
  CHECK (phone IS NOT NULL OR ig_user_id IS NOT NULL OR tg_user_id IS NOT NULL OR fb_user_id IS NOT NULL);

-- Add fb_message_id to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS fb_message_id text;

-- Seed dynamic settings for all existing tenants
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'facebook_access_token', NULL, true
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'facebook_page_id', NULL, false
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Seed facebook_reply prompt for all existing tenants
INSERT INTO ai_prompts (tenant_id, name, content)
SELECT id, 'facebook_reply', 'You are a helpful AI assistant. Answer customer queries accurately and warmly via Facebook Messenger. Keep replies concise (2-3 sentences). Always encourage the next step.'
FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;
