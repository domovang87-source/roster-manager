-- Run after subscriptions-migration.sql. Ties each subscription row to the logged-in Supabase user
-- so /api/check-subscription only grants Pro for that account.

BEGIN;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Multiple NULL user_ids are allowed (legacy rows); each non-null user_id is unique.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_id_unique ON subscriptions (user_id);

COMMIT;
