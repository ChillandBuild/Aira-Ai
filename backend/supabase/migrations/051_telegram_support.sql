-- Alter leads table to add telegram columns
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tg_user_id text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tg_username text;

-- Create unique index for tg_user_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_tg_user_id ON leads(tg_user_id) WHERE tg_user_id IS NOT NULL;

-- Update constraints
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_check;
ALTER TABLE leads ADD CONSTRAINT leads_source_check CHECK (source IN ('whatsapp', 'instagram', 'upload', 'manual', 'telegram', 'facebook'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_needs_identity;
ALTER TABLE leads ADD CONSTRAINT leads_needs_identity CHECK (phone IS NOT NULL OR ig_user_id IS NOT NULL OR tg_user_id IS NOT NULL);

-- Alter messages table to add tg_message_id column
ALTER TABLE messages ADD COLUMN IF NOT EXISTS tg_message_id text;

-- Seed dynamic setting for all existing tenants
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'telegram_bot_token', NULL, true
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Seed telegram_reply and instagram_reply prompts for all existing tenants
INSERT INTO ai_prompts (tenant_id, name, content)
SELECT id, 'telegram_reply', 'You are a helpful AI assistant. Answer customer queries accurately and warmly via Telegram. Keep replies concise (2-3 sentences). Always encourage the next step.'
FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO ai_prompts (tenant_id, name, content)
SELECT id, 'instagram_reply', 'You are a helpful AI assistant. Answer customer queries accurately and warmly via Instagram. Keep replies concise (2-3 sentences). Always encourage the next step.'
FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;
