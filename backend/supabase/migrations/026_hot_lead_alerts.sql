CREATE TABLE IF NOT EXISTS hot_lead_alerts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  assigned_caller_id uuid REFERENCES callers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'escalated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES callers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS hot_lead_alerts_tenant_status_idx
  ON hot_lead_alerts (tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS hot_lead_alerts_lead_id_idx
  ON hot_lead_alerts (lead_id);
