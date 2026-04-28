ALTER TABLE callers ADD COLUMN IF NOT EXISTS user_id uuid;
CREATE INDEX IF NOT EXISTS callers_user_id_idx ON callers (user_id) WHERE user_id IS NOT NULL;
COMMENT ON COLUMN callers.user_id IS 'Links telecaller profile to Supabase auth user. NULL for callers without dashboard access.';
