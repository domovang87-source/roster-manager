-- Run in Supabase → SQL Editor.
-- `status` on subscriptions = Stripe billing lifecycle (active / cancelled), NOT product tier.
-- `tier` = Free | Pro | Elite for humans and reporting.

CREATE OR REPLACE VIEW public.subscriptions_with_user_email AS
SELECT
  s.*,
  u.email AS user_email,
  CASE
    WHEN s.status IS DISTINCT FROM 'active' THEN 'Free'
    WHEN COALESCE(s.plan_tier, 'pro') = 'elite' THEN 'Elite'
    ELSE 'Pro'
  END AS tier
FROM public.subscriptions AS s
LEFT JOIN auth.users AS u ON u.id = s.user_id;

COMMENT ON VIEW public.subscriptions_with_user_email IS
  'subscriptions + email + computed tier. Column `status` is billing state; use `tier` for Free/Pro/Elite.';
