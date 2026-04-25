-- voice_numbers: pool of Twilio DID numbers for telecalling
CREATE TABLE voice_numbers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  number text NOT NULL UNIQUE,
  display_name text NOT NULL,
  provider text NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio', 'exotel')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
  pickup_rate numeric(5,2) DEFAULT 100.0,
  calls_today int NOT NULL DEFAULT 0,
  spam_score int NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER voice_numbers_updated_at BEFORE UPDATE ON voice_numbers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE INDEX idx_voice_numbers_status ON voice_numbers(status);
