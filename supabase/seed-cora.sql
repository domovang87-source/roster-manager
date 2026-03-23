-- Seed Cora as a test prospect with a sample message and draft (run after home-data.sql)
-- Use in Supabase SQL Editor or: psql ... -f supabase/seed-cora.sql

INSERT INTO prospects (name, tier, phone_number)
SELECT 'Cora', 'C', '+15555551234'
WHERE NOT EXISTS (SELECT 1 FROM prospects WHERE name = 'Cora');

-- Add sample message for Cora (run once; re-run adds another message)
INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'inbound', 'Hey! Are we still on for tonight?'
FROM prospects
WHERE name = 'Cora'
LIMIT 1;

-- Add sample scheduled reply for Cora (auto-sends in ~2 hrs; ensure B/C auto_respond is ON in Tier Rules)
INSERT INTO scheduled_replies (prospect_id, tier, draft_text, status, scheduled_for)
SELECT id, 'C', 'You''re the cutest.', 'scheduled', now() + interval '2 hours'
FROM prospects
WHERE name = 'Cora'
  AND NOT EXISTS (SELECT 1 FROM scheduled_replies sr WHERE sr.prospect_id = prospects.id AND sr.status = 'scheduled')
LIMIT 1;
