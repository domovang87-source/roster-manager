BEGIN;

ALTER TABLE tier_rules
ADD COLUMN IF NOT EXISTS remind_after_days integer NOT NULL DEFAULT 14;

UPDATE tier_rules SET remind_after_days = 7 WHERE tier = 'A';
UPDATE tier_rules SET remind_after_days = 14 WHERE tier = 'B';
UPDATE tier_rules SET remind_after_days = 30 WHERE tier = 'C';

COMMIT;
