-- Run after subscriptions-user-migration.sql.
-- Stores Stripe checkout tier (pro vs elite) for feature gating.

BEGIN;

ALTER TABLE subscriptions
ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'pro';

COMMIT;
