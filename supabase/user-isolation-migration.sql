-- STACK: User isolation migration
-- Adds user_id to all main tables and enforces per-user RLS.
-- Run in Supabase SQL Editor ONCE.

BEGIN;

-- ─── prospects ────────────────────────────────────────────────
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Back-fill: any existing rows without a user_id stay NULL for now
-- (they will be invisible to all users, which is the safe default).

ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to prospects" ON prospects;
DROP POLICY IF EXISTS "Users manage own prospects" ON prospects;
CREATE POLICY "Users manage own prospects" ON prospects
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── messages (linked via prospects, no separate user_id needed) ──
-- messages.prospect_id → prospects.id → prospects.user_id
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to messages" ON messages;
DROP POLICY IF EXISTS "Users manage own messages" ON messages;
CREATE POLICY "Users manage own messages" ON messages
  FOR ALL
  USING  (EXISTS (SELECT 1 FROM prospects p WHERE p.id = messages.prospect_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM prospects p WHERE p.id = messages.prospect_id AND p.user_id = auth.uid()));

-- ─── scheduled_replies ─────────────────────────────────────────
ALTER TABLE scheduled_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to scheduled_replies" ON scheduled_replies;
DROP POLICY IF EXISTS "Users manage own scheduled_replies" ON scheduled_replies;
CREATE POLICY "Users manage own scheduled_replies" ON scheduled_replies
  FOR ALL
  USING  (EXISTS (SELECT 1 FROM prospects p WHERE p.id = scheduled_replies.prospect_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM prospects p WHERE p.id = scheduled_replies.prospect_id AND p.user_id = auth.uid()));

-- ─── tier_rules ────────────────────────────────────────────────
ALTER TABLE tier_rules
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE tier_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to tier_rules" ON tier_rules;
DROP POLICY IF EXISTS "Users manage own tier_rules" ON tier_rules;
CREATE POLICY "Users manage own tier_rules" ON tier_rules
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMIT;
