-- Migration 038: Broadcast tracking with broadcast_id
-- Purpose: Track which leads received which broadcast, enable accurate failed CSV generation

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  broadcast_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES leads(id),
  phone text NOT NULL,
  name text,
  send_status text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('sent', 'failed', 'rejected', 'opted_out_skip')),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_br_broadcast ON broadcast_recipients(tenant_id, broadcast_id);
CREATE INDEX IF NOT EXISTS idx_br_lead ON broadcast_recipients(lead_id);
CREATE INDEX IF NOT EXISTS idx_br_phone ON broadcast_recipients(phone);

-- Add opted_out_at column to track when leads opted out
ALTER TABLE leads ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;
