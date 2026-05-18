-- Add groq_api_key setting row for all existing tenants.
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'groq_api_key', NULL, true
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;
