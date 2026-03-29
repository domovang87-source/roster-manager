-- Weekly roster audit: server-side week-over-week momentum (cron + Resend).
-- Service role bypasses RLS; no user-facing policies needed.

BEGIN;

CREATE TABLE IF NOT EXISTS roster_audit_weekly_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  iso_week text NOT NULL,
  avg_momentum double precision NOT NULL,
  prospect_momenta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, iso_week)
);

CREATE INDEX IF NOT EXISTS roster_audit_weekly_snapshots_user_week_idx
  ON roster_audit_weekly_snapshots (user_id, iso_week);

ALTER TABLE roster_audit_weekly_snapshots ENABLE ROW LEVEL SECURITY;

COMMIT;
