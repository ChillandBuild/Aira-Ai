-- Migration 106: archive + block a conversation
-- Orthogonal to opted_out (broadcast) and do_not_call (voice): these are inbox
-- folder states. archived = tidied out of the active inbox; blocked = stop AI
-- replies and hide from the active inbox.
ALTER TABLE leads
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS blocked_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_leads_archived_at
    ON leads (tenant_id, archived_at) WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_blocked_at
    ON leads (tenant_id, blocked_at) WHERE blocked_at IS NOT NULL;
