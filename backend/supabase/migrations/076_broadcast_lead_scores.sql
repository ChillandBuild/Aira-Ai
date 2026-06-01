-- Migration 076: Per-broadcast lead scoring
-- Purpose: Each broadcast gets its own scoring slate per lead.
--   broadcast_lead_scores — fresh score per (broadcast, lead); never carries over between sends.
--   lead_tag_interest     — gains score/segment columns so the tag-level roll-up
--                          reflects actual product-specific interest, not global segment.

-- 1. Per-broadcast score table
CREATE TABLE IF NOT EXISTS broadcast_lead_scores (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL,
  broadcast_id       uuid        NOT NULL REFERENCES scheduled_broadcasts(id),
  lead_id            uuid        NOT NULL,
  tag_id             uuid        REFERENCES broadcast_tags(id),
  score              int         NOT NULL DEFAULT 5,
  segment            text        NOT NULL DEFAULT 'C',
  arc_score          int         NOT NULL DEFAULT 5,
  arc_message_count  int         NOT NULL DEFAULT 0,
  segment_drop_count int         NOT NULL DEFAULT 0,
  last_inbound_at    timestamptz,
  broadcast_sent_at  timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(broadcast_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_bls_broadcast ON broadcast_lead_scores(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_bls_lead      ON broadcast_lead_scores(lead_id);
CREATE INDEX IF NOT EXISTS idx_bls_tenant    ON broadcast_lead_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bls_tag       ON broadcast_lead_scores(tag_id) WHERE tag_id IS NOT NULL;

-- 2. Add score/segment columns to lead_tag_interest (tag-level roll-up)
ALTER TABLE lead_tag_interest ADD COLUMN IF NOT EXISTS score   int  NOT NULL DEFAULT 5;
ALTER TABLE lead_tag_interest ADD COLUMN IF NOT EXISTS segment text NOT NULL DEFAULT 'C';
ALTER TABLE lead_tag_interest ADD COLUMN IF NOT EXISTS last_broadcast_sent_at timestamptz;
