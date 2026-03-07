-- Roster Manager: migrate tiers to A/B/C model
-- This script updates existing data and provides guidance for enum migrations.

BEGIN;

-- Map legacy tiers into A/B/C.
-- S and A -> A
-- B -> B
-- C, D, F -> C
UPDATE prospects
SET tier = CASE
  WHEN tier IN ('S', 'A') THEN 'A'
  WHEN tier = 'B' THEN 'B'
  ELSE 'C'
END;

UPDATE tier_rules
SET tier = CASE
  WHEN tier IN ('S', 'A') THEN 'A'
  WHEN tier = 'B' THEN 'B'
  ELSE 'C'
END;

COMMIT;

-- If tier columns are enums, you'll need to update the enum type.
-- Option A: If you know the enum type name, create a new enum and cast.
-- Example (replace <enum_name> with your actual enum type name):
-- BEGIN;
-- CREATE TYPE tier_abc AS ENUM ('A', 'B', 'C');
-- ALTER TABLE prospects
--   ALTER COLUMN tier TYPE tier_abc
--   USING tier::text::tier_abc;
-- ALTER TABLE tier_rules
--   ALTER COLUMN tier TYPE tier_abc
--   USING tier::text::tier_abc;
-- DROP TYPE <enum_name>;
-- ALTER TYPE tier_abc RENAME TO <enum_name>;
-- COMMIT;

-- Option B: If tier columns are text/varchar, no enum change is needed.
