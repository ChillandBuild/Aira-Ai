ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS needs_human_attention bool DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalation_reason text;

CREATE TABLE IF NOT EXISTS chat_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL REFERENCES leads(id),
  assigned_to uuid REFERENCES callers(id),
  reason text,
  status text DEFAULT 'pending',
  opened_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_chat_handovers_tenant_status ON chat_handovers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_chat_handovers_lead ON chat_handovers(lead_id);
