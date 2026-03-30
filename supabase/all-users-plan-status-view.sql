-- Supabase → SQL Editor → Run as one script.
-- Adds plan_tier if missing (same as subscriptions-plan-tier-migration.sql), then creates the view.

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'pro';

CREATE OR REPLACE VIEW public.all_users_plan_status AS
SELECT
  u.id AS user_id,
  u.email,
  u.created_at AS signed_up_at,
  s.status AS subscription_billing_status,
  s.plan_tier AS subscription_plan_tier,
  CASE
    WHEN s.user_id IS NULL OR s.status IS DISTINCT FROM 'active' THEN 'Free'
    WHEN COALESCE(s.plan_tier, 'pro') = 'elite' THEN 'Elite'
    ELSE 'Pro'
  END AS plan_status
FROM auth.users u
LEFT JOIN public.subscriptions s ON s.user_id = u.id;

COMMENT ON VIEW public.all_users_plan_status IS
  'All auth users + plan_status from subscriptions only. After you add public.profiles, run all-users-plan-status-view-with-profiles.sql to include manual is_pro/is_elite.';

-- SELECT * FROM public.all_users_plan_status ORDER BY signed_up_at DESC;
