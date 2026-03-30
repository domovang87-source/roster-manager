-- Optional: every auth user with a single Tier label (includes people with no subscriptions row = Free).
-- Run in Supabase → SQL Editor. Does not include profiles.is_pro overrides (use app / check-subscription for that).

CREATE OR REPLACE VIEW public.users_with_account_tier AS
SELECT
  u.id AS user_id,
  u.email,
  CASE
    WHEN s.user_id IS NULL THEN 'Free'
    WHEN s.status IS DISTINCT FROM 'active' THEN 'Free'
    WHEN COALESCE(s.plan_tier, 'pro') = 'elite' THEN 'Elite'
    ELSE 'Pro'
  END AS tier,
  s.status AS subscription_billing_status,
  s.plan_tier AS subscription_plan_tier
FROM auth.users AS u
LEFT JOIN public.subscriptions AS s ON s.user_id = u.id;

COMMENT ON VIEW public.users_with_account_tier IS
  'Auth users + subscription row; tier from billing. Manual Pro via profiles.is_pro is not reflected here.';
