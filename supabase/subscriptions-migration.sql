BEGIN;

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  stripe_session_id text UNIQUE NOT NULL,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to subscriptions" ON subscriptions;
CREATE POLICY "Allow all access to subscriptions" ON subscriptions
  FOR ALL USING (true) WITH CHECK (true);

COMMIT;
