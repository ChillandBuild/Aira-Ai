-- backend/supabase/migrations/025_leads_assigned_to.sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES callers(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS leads_assigned_to_idx ON leads (assigned_to, tenant_id);
