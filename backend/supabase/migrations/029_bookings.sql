-- 029_bookings.sql
-- One booking record per lead per event attempt.
-- Booking moves: draft → pending_payment → confirmed → cancelled

CREATE TABLE IF NOT EXISTS bookings (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      uuid        NOT NULL,
  lead_id        uuid        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  event_name     text        NOT NULL DEFAULT 'Guru Peyarchi Homam',
  devotee_name   text,
  rasi           text,
  nakshatram     text,
  gotram         text,
  delivery_address text,
  booking_ref    text        UNIQUE,
  status         text        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'pending_payment', 'confirmed', 'cancelled')),
  payment_link   text,
  razorpay_payment_id text,
  amount_paise   integer,
  paid_at        timestamptz,
  confirmed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_lead_id_idx   ON bookings (lead_id, tenant_id);
CREATE INDEX IF NOT EXISTS bookings_status_idx    ON bookings (status, tenant_id);
CREATE INDEX IF NOT EXISTS bookings_booking_ref_idx ON bookings (booking_ref);

-- Generate a short human-readable reference like GPH-2026-0001
CREATE SEQUENCE IF NOT EXISTS booking_ref_seq START 1;

CREATE OR REPLACE FUNCTION generate_booking_ref()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.booking_ref := 'GPH-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('booking_ref_seq')::text, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_booking_ref
  BEFORE INSERT ON bookings
  FOR EACH ROW
  WHEN (NEW.booking_ref IS NULL)
  EXECUTE FUNCTION generate_booking_ref();
