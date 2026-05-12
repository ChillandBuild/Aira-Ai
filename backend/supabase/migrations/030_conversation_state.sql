-- 030_conversation_state.sql
-- One row per lead. Tracks current step in an active booking flow.
-- State machine states: idle | collecting_name | collecting_rasi |
--   collecting_nakshatram | collecting_gotram | collecting_address | awaiting_payment

CREATE TABLE IF NOT EXISTS lead_conversation_state (
  id          uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id     uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id   uuid        NOT NULL,
  flow_name   text        NOT NULL DEFAULT 'booking',
  state       text        NOT NULL DEFAULT 'idle',
  draft_data  jsonb       NOT NULL DEFAULT '{}',
  booking_id  uuid        REFERENCES bookings(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lead_conversation_state_lead_unique UNIQUE (lead_id)
);

CREATE INDEX IF NOT EXISTS conv_state_lead_idx ON lead_conversation_state (lead_id);
