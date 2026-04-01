-- STACK: Lock subscriptions to the owning user (webhook uses service role — bypasses RLS).
-- Run in Supabase SQL Editor after subscriptions-user-migration.sql.
-- Replaces wide-open policies from subscriptions-migration.sql.

BEGIN;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users manage own subscriptions" ON subscriptions;

CREATE POLICY "Users manage own subscriptions" ON subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
