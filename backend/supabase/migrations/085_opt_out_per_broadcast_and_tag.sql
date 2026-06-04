-- Migration 085: Per-broadcast and per-tag opt-out
-- - lead_tag_opt_outs: per-(tenant, lead, tag) opt-out rows. NULL tag_id = "opted out of all tags" sentinel.
-- - broadcast_recipients.opted_out_at: timestamp set when the lead opts out for THIS broadcast.
-- - Backfill: existing leads with leads.opted_out=true become "all tags" sentinels so the new
--   per-tag skip logic preserves their suppression.

CREATE TABLE IF NOT EXISTS lead_tag_opt_outs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  lead_id      uuid NOT NULL,
  tag_id       uuid REFERENCES broadcast_tags(id),
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  source       text NOT NULL DEFAULT 'inbound' CHECK (source IN ('inbound', 'manual', 'backfill')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, lead_id, tag_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_ltoo_global
  ON lead_tag_opt_outs(tenant_id, lead_id) WHERE tag_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_ltoo_tag_phone
  ON lead_tag_opt_outs(tenant_id, tag_id);

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS opted_out_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_br_opted_out
  ON broadcast_recipients(broadcast_id, opted_out_at)
  WHERE opted_out_at IS NOT NULL;

INSERT INTO lead_tag_opt_outs (tenant_id, lead_id, tag_id, opted_out_at, source)
SELECT tenant_id, id, NULL, opted_out_at, 'backfill'
FROM leads
WHERE opted_out = TRUE AND opted_out_at IS NOT NULL
ON CONFLICT DO NOTHING;
