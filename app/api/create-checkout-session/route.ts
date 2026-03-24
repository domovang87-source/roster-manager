import { NextResponse } from "next/server";
import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;
const stripe = secretKey ? new Stripe(secretKey) : null;
const priceId = process.env.STRIPE_PRICE_ID;
const checkoutMode = (process.env.STRIPE_CHECKOUT_MODE ?? "subscription") as
  | "subscription"
  | "payment";

export async function POST(req: Request) {
  if (!stripe || !priceId) {
    return NextResponse.json(
      { error: "Stripe is not configured." },
      { status: 500 }
    );
  }

  try {
    const body = (await req.json()) as {
      success_url?: string;
      cancel_url?: string;
    };

    const base =
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined) ??
      "http://localhost:3000";

    const session = await stripe!.checkout.sessions.create({
      mode: checkoutMode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: body.success_url ?? `${base}/home?success=1`,
      cancel_url: body.cancel_url ?? `${base}/home?canceled=1`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session." },
      { status: 500 }
    );
  }
}
