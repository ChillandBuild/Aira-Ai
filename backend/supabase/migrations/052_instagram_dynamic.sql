-- Seed dynamic settings for Instagram for all existing tenants
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'instagram_access_token', NULL, true
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;

INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'instagram_page_id', NULL, false
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;
