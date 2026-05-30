-- Migration 072: Add collected_data JSONB to leads for AI-driven data collection
ALTER TABLE leads ADD COLUMN IF NOT EXISTS collected_data JSONB;
CREATE INDEX IF NOT EXISTS idx_leads_collected_data ON leads USING GIN (collected_data);
COMMENT ON COLUMN leads.collected_data IS 'Structured data collected during AI conversation (booking, enrollment, etc.) — schema defined per tenant via AI Tune';
