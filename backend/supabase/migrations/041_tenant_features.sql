ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS enabled_features text[] DEFAULT ARRAY['whatsapp', 'telecalling'],
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

UPDATE tenants SET enabled_features = ARRAY['whatsapp', 'telecalling'] WHERE enabled_features IS NULL;
UPDATE tenants SET status = 'active' WHERE status IS NULL;
