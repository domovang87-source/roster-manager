-- Run ONLY after public.profiles exists (see profiles-subscription-flags-migration.sql).
-- Replaces the view to merge Stripe + profile flags like the app.

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'pro';

CREATE OR REPLACE VIEW public.all_users_plan_status AS
SELECT
  u.id AS user_id,
  u.email,
  u.created_at AS signed_up_at,
  s.status AS subscription_billing_status,
  s.plan_tier AS subscription_plan_tier,
  COALESCE(p.is_pro, false) AS profile_is_pro,
  COALESCE(p.is_elite, false) AS profile_is_elite,
  CASE
    WHEN
      NOT (
        s.status = 'active'
        OR COALESCE(p.is_pro, false)
        OR COALESCE(p.is_elite, false)
      )
      THEN 'Free'
    WHEN
      (s.status = 'active' AND COALESCE(s.plan_tier, 'pro') = 'elite')
      OR COALESCE(p.is_elite, false)
      THEN 'Elite'
    ELSE 'Pro'
  END AS plan_status
FROM auth.users u
LEFT JOIN public.subscriptions s ON s.user_id = u.id
LEFT JOIN public.profiles p ON p.id = u.id;
