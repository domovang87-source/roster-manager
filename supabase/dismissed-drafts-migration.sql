BEGIN;

ALTER TABLE scheduled_replies
ADD COLUMN IF NOT EXISTS dismissed_at timestamptz;

-- If a status check constraint exists, widen it to include "dismissed".
ALTER TABLE scheduled_replies
DROP CONSTRAINT IF EXISTS scheduled_replies_status_check;

ALTER TABLE scheduled_replies
ADD CONSTRAINT scheduled_replies_status_check
CHECK (status IN ('scheduled', 'pending', 'sent', 'dismissed'));

COMMIT;
