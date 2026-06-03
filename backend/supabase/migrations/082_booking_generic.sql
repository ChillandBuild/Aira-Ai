-- Generic SaaS: remove GPH-specific hardcodes from bookings schema.
-- event_name and ref prefix move to per-tenant app_settings; ref generation moves to app code.

ALTER TABLE bookings ALTER COLUMN event_name DROP DEFAULT;

DROP TRIGGER IF EXISTS set_booking_ref ON bookings;
DROP FUNCTION IF EXISTS generate_booking_ref();
DROP SEQUENCE IF EXISTS booking_ref_seq;
