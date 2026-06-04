-- Migration 086: Add lead_id FK to lead_tag_opt_outs + cleanup orphan rows
--
-- Background:
--   Migration 085 created lead_tag_opt_outs but did NOT add a foreign key
--   from lead_id to leads.id. The PostgREST client in upload.py uses the
--   leads!inner(phone) join syntax (risk_audit + bulk-send opt-out lookups)
--   which requires this FK — without it, queries fail with PGRST200:
--   "Could not find a relationship between 'lead_tag_opt_outs' and 'leads'".
--
--   Some rows in lead_tag_opt_outs have lead_ids that no longer exist in
--   the leads table (e.g., the lead was hard-deleted after the opt-out was
--   recorded). Adding the FK without cleanup fails with error 23503.
--
-- Steps:
--   1. Delete orphan rows from lead_tag_opt_outs (lead_id missing from leads)
--   2. Add the FK with ON DELETE CASCADE (future lead deletes clean up opt-out rows)

BEGIN;

-- Step 1: Clean up orphan rows
DELETE FROM lead_tag_opt_outs
WHERE NOT EXISTS (
  SELECT 1 FROM leads WHERE leads.id = lead_tag_opt_outs.lead_id
);

-- Step 2: Add the foreign key
ALTER TABLE lead_tag_opt_outs
  ADD CONSTRAINT fk_ltoo_lead_id
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE;

COMMIT;
