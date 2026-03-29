-- When the user hides a card (X), we set briefing_cleared_at so the daily briefing
-- ignores them until new inbound activity or they restore the card.
-- Run against your Supabase project (SQL editor or CLI).

BEGIN;

ALTER TABLE prospects
ADD COLUMN IF NOT EXISTS briefing_cleared_at timestamptz;

COMMIT;
