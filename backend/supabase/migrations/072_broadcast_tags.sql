-- Migration 072: Broadcast tags + per-tag interest tracking
-- Purpose: Tag broadcasts by product category, track lead interest per tag

-- 1. Tag catalog (user-defined)
CREATE TABLE IF NOT EXISTS broadcast_tags (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  name      text NOT NULL,
  color     text NOT NULL DEFAULT '#6D28D9',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_broadcast_tags_tenant ON broadcast_tags(tenant_id);

-- 2. Tag reference on scheduled_broadcasts
ALTER TABLE scheduled_broadcasts ADD COLUMN IF NOT EXISTS tag_id uuid REFERENCES broadcast_tags(id);

-- 3. Tag reference on broadcast_recipients
ALTER TABLE broadcast_recipients ADD COLUMN IF NOT EXISTS tag_id uuid REFERENCES broadcast_tags(id);
CREATE INDEX IF NOT EXISTS idx_br_tag ON broadcast_recipients(tag_id) WHERE tag_id IS NOT NULL;

-- 4. Lead interest per tag (accumulated over time)
CREATE TABLE IF NOT EXISTS lead_tag_interest (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  lead_id       uuid NOT NULL,
  tag_id        uuid NOT NULL,
  hot           int NOT NULL DEFAULT 0,
  warm          int NOT NULL DEFAULT 0,
  cold          int NOT NULL DEFAULT 0,
  last_seen     timestamptz NOT NULL DEFAULT now(),
  broadcast_count int NOT NULL DEFAULT 0,
  UNIQUE(tenant_id, lead_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_lti_tenant ON lead_tag_interest(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lti_tag    ON lead_tag_interest(tag_id);
CREATE INDEX IF NOT EXISTS idx_lti_lead   ON lead_tag_interest(lead_id);
