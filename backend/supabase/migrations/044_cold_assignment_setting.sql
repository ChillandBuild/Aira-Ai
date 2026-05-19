INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'cold_assignment_enabled', 'false', false
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;
