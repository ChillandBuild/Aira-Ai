-- 1. phone_number_quality_history
CREATE TABLE IF NOT EXISTS phone_number_quality_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number_id uuid NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  quality_rating text NOT NULL,
  messaging_tier int,
  recorded_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pnqh_number_id ON phone_number_quality_history(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_pnqh_tenant ON phone_number_quality_history(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pnqh_recorded_at ON phone_number_quality_history(recorded_at DESC);

-- 2. outbound_no_reply_count on leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outbound_no_reply_count int NOT NULL DEFAULT 0;

-- 3. variations on message_templates
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS variations jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. RPC for atomic outbound_no_reply_count increment
CREATE OR REPLACE FUNCTION increment_lead_no_reply_count(p_lead_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE leads SET outbound_no_reply_count = outbound_no_reply_count + 1 WHERE id = p_lead_id;
$$;
