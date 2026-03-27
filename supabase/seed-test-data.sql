-- Test seed: Theo + Marek with notes, messages, and activity log entries
-- Run in Supabase SQL Editor after running activity-log-migration.sql

-- Theo (A-Tier) — high priority, active
INSERT INTO prospects (name, tier, phone_number, vibe_notes)
SELECT 'Theo', 'A', '+15555551234', 'Met at Jake''s party. Into photography and hiking. Always down to hang on weekends. Texts back fast.'
WHERE NOT EXISTS (SELECT 1 FROM prospects WHERE name = 'Theo');

-- Marek (C-Tier) — keep alive, check in monthly
INSERT INTO prospects (name, tier, phone_number, vibe_notes)
SELECT 'Marek', 'C', '+15555559999', 'Old college friend. Works in finance downtown. Watches F1. Haven''t seen him since March — need to keep this one alive.'
WHERE NOT EXISTS (SELECT 1 FROM prospects WHERE name = 'Marek');

-- Messages for Theo (recent texts)
INSERT INTO messages (prospect_id, direction, body, event_type)
SELECT id, 'inbound', 'Yo we should link this weekend', 'text'
FROM prospects WHERE name = 'Theo' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body, event_type)
SELECT id, 'outbound', 'Bet, I''m free Saturday after 2', 'text'
FROM prospects WHERE name = 'Theo' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body, event_type)
SELECT id, 'inbound', 'Say less. I''ll hit you up', 'text'
FROM prospects WHERE name = 'Theo' LIMIT 1;

-- Activity log entries for Theo
INSERT INTO messages (prospect_id, direction, body, event_type, created_at)
SELECT id, null, 'Went to rooftop bar, vibes were great. Talked about weekend trip.', 'date', now() - interval '5 days'
FROM prospects WHERE name = 'Theo' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body, event_type, created_at)
SELECT id, null, 'Quick call, he asked about Saturday plans.', 'call', now() - interval '2 days'
FROM prospects WHERE name = 'Theo' LIMIT 1;

-- Messages for Marek (stale — 3 weeks ago)
INSERT INTO messages (prospect_id, direction, body, event_type, created_at)
SELECT id, 'outbound', 'For sure, let me know when you''re free', 'text', now() - interval '21 days'
FROM prospects WHERE name = 'Marek' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body, event_type, created_at)
SELECT id, 'inbound', 'Will do bro', 'text', now() - interval '21 days'
FROM prospects WHERE name = 'Marek' LIMIT 1;

-- Activity log: last hangout with Marek was a while ago
INSERT INTO messages (prospect_id, direction, body, event_type, created_at)
SELECT id, null, 'Grabbed lunch downtown. He mentioned a new job.', 'hangout', now() - interval '45 days'
FROM prospects WHERE name = 'Marek' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body, event_type, created_at)
SELECT id, null, 'Keeps flaking on plans, might need to lower priority or send a direct text.', 'note', now() - interval '10 days'
FROM prospects WHERE name = 'Marek' LIMIT 1;
