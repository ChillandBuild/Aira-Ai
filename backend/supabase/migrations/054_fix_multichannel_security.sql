-- Fix Telegram unique index: tenant-scoped instead of global
DROP INDEX IF EXISTS uq_leads_tg_user_id;
CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_tg_user_id_tenant
  ON leads(tg_user_id, tenant_id) WHERE tg_user_id IS NOT NULL;

-- Per-tenant Telegram webhook secret (auto-generated when token is saved)
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'telegram_webhook_secret', NULL, true
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Meta app secret for X-Hub-Signature-256 verification (FB/IG webhooks)
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'meta_app_secret', NULL, true
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

-- Seed facebook_reply prompt for any tenant missing it
INSERT INTO ai_prompts (tenant_id, name, content)
SELECT id, 'facebook_reply', 'You are a helpful AI assistant. Answer customer queries accurately and warmly via Facebook Messenger. Keep replies concise (2-3 sentences). Always encourage the next step.'
FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;
