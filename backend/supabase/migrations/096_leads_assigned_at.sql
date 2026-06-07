-- Migration 096: Add assigned_at to leads and keep it updated via trigger
-- Purpose: Track when a lead is assigned to a telecaller

ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_at timestamptz;

-- Populate existing assigned leads with their created_at value
UPDATE leads 
SET assigned_at = created_at 
WHERE assigned_to IS NOT NULL AND assigned_at IS NULL;

-- Trigger function to automatically update assigned_at
CREATE OR REPLACE FUNCTION update_leads_assigned_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        IF NEW.assigned_to IS NOT NULL THEN
            NEW.assigned_at := NOW();
        ELSE
            NEW.assigned_at := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to run before any update on leads
DROP TRIGGER IF EXISTS leads_assigned_at_trigger ON leads;
CREATE TRIGGER leads_assigned_at_trigger
    BEFORE UPDATE ON leads
    FOR EACH ROW
    EXECUTE FUNCTION update_leads_assigned_at();
