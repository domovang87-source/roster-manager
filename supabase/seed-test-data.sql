-- Test seed: Ava + Cora with messages (run after home-data.sql)
-- Use in Supabase SQL Editor to verify roster ↔ messages connection
-- Run: supabase/seed-test-data.sql

-- Ava (A-Tier)
INSERT INTO prospects (name, tier, phone_number, vibe_notes)
SELECT 'Ava', 'A', '+15555551234', 'Met at the gallery opening.'
WHERE NOT EXISTS (SELECT 1 FROM prospects WHERE name = 'Ava');

-- Cora (C-Tier)
INSERT INTO prospects (name, tier, phone_number, vibe_notes)
SELECT 'Cora', 'C', '+15555559999', 'Coffee shop regular.'
WHERE NOT EXISTS (SELECT 1 FROM prospects WHERE name = 'Cora');

-- Messages for Ava
INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'inbound', 'Hey! Are we still on for tonight?'
FROM prospects WHERE name = 'Ava' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'outbound', 'Yeah, 8pm work?'
FROM prospects WHERE name = 'Ava' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'inbound', 'Perfect, see you then 💕'
FROM prospects WHERE name = 'Ava' LIMIT 1;

-- Messages for Cora
INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'inbound', 'I got you a coffee :)'
FROM prospects WHERE name = 'Cora' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'outbound', 'You''re the cutest. Thanks!'
FROM prospects WHERE name = 'Cora' LIMIT 1;

-- Optional: scheduled reply for Cora
INSERT INTO scheduled_replies (prospect_id, tier, draft_text, status, scheduled_for)
SELECT id, 'C', 'You''re the cutest.', 'scheduled', now() + interval '2 hours'
FROM prospects
WHERE name = 'Cora'
  AND NOT EXISTS (SELECT 1 FROM scheduled_replies sr WHERE sr.prospect_id = prospects.id AND sr.status = 'scheduled')
LIMIT 1;
