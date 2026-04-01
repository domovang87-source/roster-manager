-- ⚠️  DO NOT RUN THIS FILE IN PRODUCTION — it sets USING (true) on user data tables.
-- Use instead:
--   - user-isolation-migration.sql  (prospects, messages, scheduled_replies, tier_rules)
--   - subscriptions-rls-user-scoped.sql  (subscriptions)
-- This file is kept only as a historical reference.

BEGIN;

-- Messages: allow all operations
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to messages" ON messages;
CREATE POLICY "Allow all access to messages" ON messages
  FOR ALL USING (true) WITH CHECK (true);

-- Prospects: allow all operations
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to prospects" ON prospects;
CREATE POLICY "Allow all access to prospects" ON prospects
  FOR ALL USING (true) WITH CHECK (true);

-- Scheduled replies: allow all operations
ALTER TABLE scheduled_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to scheduled_replies" ON scheduled_replies;
CREATE POLICY "Allow all access to scheduled_replies" ON scheduled_replies
  FOR ALL USING (true) WITH CHECK (true);

-- Tier rules: allow all operations
ALTER TABLE tier_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to tier_rules" ON tier_rules;
CREATE POLICY "Allow all access to tier_rules" ON tier_rules
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;
