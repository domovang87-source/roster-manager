import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerSupabase } from "@/lib/supabase/server";

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;
const priceId = process.env.STRIPE_PRICE_ID;
const checkoutMode = (process.env.STRIPE_CHECKOUT_MODE ?? "subscription") as
  | "subscription"
  | "payment";

export async function POST(req: Request) {
  if (!stripe || !priceId) {
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

  try {
    const origin = req.headers.get("origin") || req.headers.get("referer")?.replace(/\/[^/]*$/, "") || "http://127.0.0.1:3000";
    const base =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
      origin;

    const session = await stripe.checkout.sessions.create({
      mode: checkoutMode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${base}/home?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/home?canceled=1`,
      client_reference_id: user.id,
      metadata: { supabase_user_id: user.id },
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json({ error: "Failed to create checkout session." }, { status: 500 });
  }
}
