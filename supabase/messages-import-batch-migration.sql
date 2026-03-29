-- Groups all lines from one screenshot import so the Activity Log can "delete whole batch".
-- Run in Supabase SQL Editor.

BEGIN;

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS messages_import_batch_id_idx ON messages (import_batch_id);

COMMIT;
