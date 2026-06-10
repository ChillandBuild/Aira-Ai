ALTER TABLE leads ADD COLUMN IF NOT EXISTS call_status text NOT NULL DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS do_not_call boolean NOT NULL DEFAULT false;

-- allowed call_status values: new, in_progress, callback, converted, not_interested, dnc, unreachable
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_call_status_check;
ALTER TABLE leads ADD CONSTRAINT leads_call_status_check CHECK (call_status IN
  ('new','in_progress','callback','converted','not_interested','dnc','unreachable'));

CREATE INDEX IF NOT EXISTS idx_leads_call_status ON leads (tenant_id, call_status);
