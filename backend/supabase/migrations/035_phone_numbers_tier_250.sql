-- Add TIER_250 (Meta's starting tier for new numbers) to messaging_tier constraint
ALTER TABLE phone_numbers
  DROP CONSTRAINT phone_numbers_messaging_tier_check;

ALTER TABLE phone_numbers
  ADD CONSTRAINT phone_numbers_messaging_tier_check
    CHECK (messaging_tier IN (250, 1000, 10000, 100000));

-- Fix Astro AI number to reflect actual Meta tier
UPDATE phone_numbers
SET messaging_tier = 250
WHERE meta_phone_number_id = '1120977921096025';
