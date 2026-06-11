-- Migration 103: Re-engagement source filter
-- Purpose: Let a re-engagement step target leads by acquisition source.
-- NULL / empty = all sources (backwards compatible). Bucket keys:
--   organic | meta_ads | csv | telegram | instagram | facebook

ALTER TABLE public.reengagement_steps
  ADD COLUMN IF NOT EXISTS target_sources jsonb;
