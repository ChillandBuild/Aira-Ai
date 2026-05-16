-- Migration 037: Add delivery_status tracking to messages table
-- Purpose: Track WhatsApp message delivery status (sent, delivered, read, failed)
-- for broadcast campaign analytics

-- Add delivery_status column with check constraint
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status TEXT DEFAULT 'sent' 
  CHECK (delivery_status IN ('sent', 'delivered', 'read', 'failed'));

-- Add composite index for faster status queries by tenant
CREATE INDEX IF NOT EXISTS messages_delivery_status_idx ON messages (delivery_status, tenant_id);

-- Backfill existing outbound messages as 'sent'
UPDATE messages SET delivery_status = 'sent' 
WHERE direction = 'outbound' AND delivery_status IS NULL;

-- Backfill existing inbound messages as 'read' (they were received by us)
UPDATE messages SET delivery_status = 'read' 
WHERE direction = 'inbound' AND delivery_status IS NULL;
