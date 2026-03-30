-- Optional: one row per user per tier (prevents duplicate tier_rules and fixes insert-only flows).
-- Run in Supabase SQL Editor if upserts or saves ever create duplicate (user_id, tier) rows.

CREATE UNIQUE INDEX IF NOT EXISTS tier_rules_user_id_tier_key ON tier_rules (user_id, tier)
WHERE user_id IS NOT NULL;
