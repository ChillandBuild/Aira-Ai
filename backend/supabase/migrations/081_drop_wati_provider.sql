-- Drop WATI provider from phone_numbers.
-- WATI was the planned secondary WhatsApp provider; only Meta Cloud API is in use.
ALTER TABLE phone_numbers DROP CONSTRAINT IF EXISTS phone_numbers_provider_check;

ALTER TABLE phone_numbers
  ADD CONSTRAINT phone_numbers_provider_check CHECK (provider IN ('meta_cloud'));

ALTER TABLE phone_numbers DROP COLUMN IF EXISTS api_key;
