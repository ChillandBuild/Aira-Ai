-- Add 'bulkwise' to the phone_numbers provider constraint.
-- api_key column already exists (used for WATI) — reused for Bulkwise apiToken.

ALTER TABLE phone_numbers DROP CONSTRAINT IF EXISTS phone_numbers_provider_check;

ALTER TABLE phone_numbers
  ADD CONSTRAINT phone_numbers_provider_check
  CHECK (provider IN ('meta_cloud', 'wati', 'bulkwise'));
