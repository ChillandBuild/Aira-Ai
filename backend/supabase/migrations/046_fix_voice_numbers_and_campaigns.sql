ALTER TABLE voice_numbers ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE voice_numbers SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE voice_numbers ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS voice_numbers_tenant_id_idx ON voice_numbers (tenant_id);

ALTER TABLE voice_numbers DROP CONSTRAINT IF EXISTS voice_numbers_provider_check;
ALTER TABLE voice_numbers ADD CONSTRAINT voice_numbers_provider_check CHECK (provider IN ('twilio', 'exotel', 'telecmi'));

ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id);
UPDATE ad_campaigns SET tenant_id = '00000000-0000-0000-0000-000000000001' WHERE tenant_id IS NULL;
ALTER TABLE ad_campaigns ALTER COLUMN tenant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS ad_campaigns_tenant_id_idx ON ad_campaigns (tenant_id);
