-- Migration: 058_broadcast_fail_reason
-- Created: 2026-05-20
-- Description: Add fail_reason column to broadcast_recipients for detailed failure tracking

ALTER TABLE broadcast_recipients
  ADD COLUMN IF NOT EXISTS fail_reason text;
