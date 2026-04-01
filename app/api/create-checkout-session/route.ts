import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerSupabase } from "@/lib/supabase/server";
import { trustedAppBaseUrl } from "@/lib/security/checkout-url";
import { RATE } from "@/lib/security/rate-limit";
import { rateLimitExceeded } from "@/lib/security/rate-limit-response";

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;

const proPriceIds = {
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY ?? process.env.STRIPE_PRICE_ID ?? "",
  yearly: process.env.STRIPE_PRICE_ID_YEARLY ?? "",
};

/** Elite: prefer plan-specific IDs; monthly can fall back to STRIPE_PRICE_ID_ELITE for dev/single-price setups. */
const elitePriceIds = {
  monthly:
    process.env.STRIPE_PRICE_ID_ELITE_MONTHLY ??
    process.env.STRIPE_PRICE_ID_ELITE ??
    "",
  yearly: process.env.STRIPE_PRICE_ID_ELITE_YEARLY ?? "",
};

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  let supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    supabase = await createServerSupabase();
  } catch (e) {
    console.error("create-checkout-session Supabase init:", e);
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in to subscribe." },
      { status: 401 }
    );
  }

  const limited = rateLimitExceeded(
    req,
    user.id,
    "create-checkout",
    RATE.createCheckout.max,
    RATE.createCheckout.windowMs
  );
  if (limited) return limited;

  let body: { plan?: string; tier?: string };
  try {
    body = (await req.json()) as { plan?: string; tier?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const plan = body.plan === "yearly" ? "yearly" : "monthly";
  const tier = body.tier === "elite" ? "elite" : "pro";
  const priceId = tier === "elite" ? elitePriceIds[plan] : proPriceIds[plan];

  if (!priceId) {
    return NextResponse.json(
      {
        error:
          tier === "elite"
            ? plan === "yearly"
              ? "Elite yearly checkout needs STRIPE_PRICE_ID_ELITE_YEARLY in your env (Stripe Dashboard → Product → Price ID)."
              : "Elite monthly checkout needs STRIPE_PRICE_ID_ELITE_MONTHLY or STRIPE_PRICE_ID_ELITE in your env (Stripe Dashboard → Product → Price ID)."
            : `Stripe price ID for ${plan} plan is not configured.`,
      },
      { status: 500 }
    );
  }

  try {
    const base = trustedAppBaseUrl();

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/home?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/home?canceled=1`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id, plan, tier },
      allow_promotion_codes: true,
      custom_text: {
        submit: {
          message:
            "Cancel anytime from your billing settings. Apple Pay, Link, and cards accepted — pick what feels easiest.",
        },
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session." }, { status: 500 });
  }
}
