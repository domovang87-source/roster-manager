-- Test seed: Theo + Marek with notes and messages (run after home-data.sql)

-- Theo (A-Tier) — high priority, active
INSERT INTO prospects (name, tier, phone_number, vibe_notes)
SELECT 'Theo', 'A', '+15555551234', 'Met at Jake''s party. Into photography and hiking. Always down to hang on weekends. Texts back fast.'
WHERE NOT EXISTS (SELECT 1 FROM prospects WHERE name = 'Theo');

-- Marek (C-Tier) — keep alive, check in monthly
INSERT INTO prospects (name, tier, phone_number, vibe_notes)
SELECT 'Marek', 'C', '+15555559999', 'Old college friend. Works in finance downtown. Watches F1. Haven''t seen him since March — need to keep this one alive.'
WHERE NOT EXISTS (SELECT 1 FROM prospects WHERE name = 'Marek');

-- Messages for Theo (recent)
INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'inbound', 'Yo we should link this weekend'
FROM prospects WHERE name = 'Theo' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'outbound', 'Bet, I''m free Saturday after 2'
FROM prospects WHERE name = 'Theo' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body)
SELECT id, 'inbound', 'Say less. I''ll hit you up'
FROM prospects WHERE name = 'Theo' LIMIT 1;

-- Messages for Marek (stale — 3 weeks ago)
INSERT INTO messages (prospect_id, direction, body, created_at)
SELECT id, 'outbound', 'For sure, let me know when you''re free', now() - interval '21 days'
FROM prospects WHERE name = 'Marek' LIMIT 1;

INSERT INTO messages (prospect_id, direction, body, created_at)
SELECT id, 'inbound', 'Will do bro', now() - interval '21 days'
FROM prospects WHERE name = 'Marek' LIMIT 1;
