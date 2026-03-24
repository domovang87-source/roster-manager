# Stripe Integration

## Environment Variables

Add to `.env.local` (and Vercel Environment Variables):

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Secret key from Stripe Dashboard → Developers → API keys |
| `STRIPE_PRICE_ID` | Your price ID (e.g. `price_1TEKxlIh4L1XwSoRgVEEid9g`) |
| `STRIPE_WEBHOOK_SECRET` | From Stripe Dashboard → Developers → Webhooks (see below) |
| `STRIPE_CHECKOUT_MODE` | `subscription` or `payment` — use `payment` for one-time prices |
| `NEXT_PUBLIC_APP_URL` | Optional. Your live URL (e.g. `https://yourapp.vercel.app`) for redirects. Vercel sets `VERCEL_URL` automatically. |

## Webhook Setup (Production)

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**
2. **Endpoint URL:** `https://YOUR_VERCEL_URL/api/stripe-webhook`
3. **Events to send:** `checkout.session.completed`, `customer.subscription.deleted`
4. Copy the **Signing secret** (starts with `whsec_`) → add as `STRIPE_WEBHOOK_SECRET`
5. Redeploy so Vercel has the new env var

## Local Webhook Testing

Use [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe-webhook
```

The CLI will give you a `whsec_...` signing secret — use that for `STRIPE_WEBHOOK_SECRET` when testing locally.

## Flow

- **Subscribe** button on home → calls `/api/create-checkout-session` → redirects to Stripe Checkout
- After payment → Stripe redirects to `/home?success=1`
- Stripe sends webhook → `/api/stripe-webhook` (TODO: grant/revoke access in your DB)
