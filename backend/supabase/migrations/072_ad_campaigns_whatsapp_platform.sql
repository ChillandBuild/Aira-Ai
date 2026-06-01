-- Migration 072: Add 'whatsapp' as a valid platform for ad_campaigns
-- Context: CTWA (Click-to-WhatsApp Ads) arrive via the WhatsApp webhook with
-- platform="whatsapp". The original constraint only allowed instagram/facebook/google,
-- which caused campaign creation to fail silently for all WhatsApp Click-to-Ad leads.

-- Step 1: Drop the old CHECK constraint
ALTER TABLE ad_campaigns DROP CONSTRAINT IF EXISTS ad_campaigns_platform_check;

-- Step 2: Re-add it with 'whatsapp' included
ALTER TABLE ad_campaigns
  ADD CONSTRAINT ad_campaigns_platform_check
  CHECK (platform IN ('instagram', 'facebook', 'google', 'whatsapp'));

-- Step 3: Add index for fast per-platform filtering on the new page
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_platform_tenant
  ON ad_campaigns (tenant_id, platform);
