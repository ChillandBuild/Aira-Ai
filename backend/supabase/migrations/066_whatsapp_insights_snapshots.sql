-- Daily WhatsApp insights snapshots from Meta API
-- One row per phone number per day — upserted on each sync
CREATE TABLE IF NOT EXISTS whatsapp_insights_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  meta_phone_number_id text NOT NULL,
  snapshot_date date NOT NULL,
  quality_rating text,
  messaging_tier integer,
  sent integer DEFAULT 0,
  delivered integer DEFAULT 0,
  read integer DEFAULT 0,
  received integer DEFAULT 0,
  cost_by_category jsonb DEFAULT '{}',
  free_by_type jsonb DEFAULT '{}',
  paid_by_category jsonb DEFAULT '{}',
  total_cost_inr numeric(10,2) DEFAULT 0,
  synced_at timestamptz DEFAULT now(),
  UNIQUE (meta_phone_number_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_wis_tenant_date
  ON whatsapp_insights_snapshots(tenant_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_wis_phone_date
  ON whatsapp_insights_snapshots(meta_phone_number_id, snapshot_date DESC);
