-- Add event_type to messages table for Activity Log
-- Run in Supabase SQL Editor

BEGIN;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'text'
CHECK (event_type IN ('text', 'date', 'hangout', 'call', 'note'));

-- Make direction nullable (non-text events don't have a direction)
ALTER TABLE messages
ALTER COLUMN direction DROP NOT NULL;

-- Update existing rows
UPDATE messages SET event_type = 'text' WHERE event_type IS NULL;

COMMIT;
