-- Add admin_phone setting for all existing tenants.
-- Stored as a plain (non-secret) value; used by admin click-to-call feature.
INSERT INTO app_settings (tenant_id, key, value, is_secret)
SELECT id, 'admin_phone', NULL, false
FROM tenants
ON CONFLICT (tenant_id, key) DO NOTHING;
