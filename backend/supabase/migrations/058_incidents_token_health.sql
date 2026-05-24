-- Extend incidents table for token health alerts and webhook health events
-- Adds tenant_id column + new incident types

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS tenant_id UUID;
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_id ON incidents(tenant_id, created_at DESC);

-- Drop old type check, recreate with new values
ALTER TABLE incidents DROP CONSTRAINT IF EXISTS incidents_type_check;
ALTER TABLE incidents ADD CONSTRAINT incidents_type_check
  CHECK (type IN (
    'quality_yellow', 'quality_red', 'failover',
    'migration_sent', 'appeal_filed', 'standby_promoted', 'warm_up_complete',
    'token_invalid', 'webhook_unhealthy'
  ));
