import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
    : null;

export async function POST(req: Request) {
  if (!stripe || !supabase) {
    return NextResponse.json(
      { error: "Not configured." },
      { status: 500 }
    );
  }

  const { session_id } = (await req.json()) as { session_id?: string };

  if (!session_id) {
    return NextResponse.json(
      { error: "Missing session_id." },
      { status: 400 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.status !== "complete") {
      return NextResponse.json({ pro: false, reason: "not_complete" });
    }

    const { error: upsertError } = await supabase
      .from("subscriptions")
      .upsert(
        {
          stripe_session_id: session_id,
          stripe_customer_id: session.customer as string | null,
          stripe_subscription_id: session.subscription as string | null,
          status: "active",
        },
        { onConflict: "stripe_session_id" }
      );

    if (upsertError) {
      console.error("Subscription upsert error:", upsertError);
    }

    const response = NextResponse.json({ pro: true });
    response.cookies.set("stack_pro", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (err) {
    console.error("Verify checkout error:", err);
    return NextResponse.json(
      { error: "Failed to verify checkout." },
      { status: 500 }
    );
  }
}
