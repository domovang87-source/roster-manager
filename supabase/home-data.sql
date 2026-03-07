-- Home dashboard tables: messages + scheduled replies + prospects phone number

BEGIN;

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS phone_number text;

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  responded_at timestamptz
);

CREATE INDEX IF NOT EXISTS messages_prospect_id_idx ON messages (prospect_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages (created_at DESC);

CREATE TABLE IF NOT EXISTS scheduled_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES prospects(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('B', 'C')),
  draft_text text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'canceled')),
  scheduled_for timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduled_replies_status_idx ON scheduled_replies (status);
CREATE INDEX IF NOT EXISTS scheduled_replies_prospect_id_idx ON scheduled_replies (prospect_id);

COMMIT;
