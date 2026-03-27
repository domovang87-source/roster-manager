import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerSupabase } from "@/lib/supabase/server";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const cookieOpts = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 500 });
  }

  let supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    supabase = await createServerSupabase();
  } catch (e) {
    console.error("verify-checkout Supabase init:", e);
    return NextResponse.json(
      { error: "Supabase is not configured.", pro: false },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated. Sign in and return from checkout again.", pro: false },
      { status: 401 }
    );
  }

  const { session_id } = (await req.json()) as { session_id?: string };

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id.", pro: false }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.status !== "complete") {
      return NextResponse.json({ pro: false, reason: "not_complete" });
    }

    const { error: upsertError } = await supabase.from("subscriptions").upsert(
      {
        user_id: user.id,
        stripe_session_id: session_id,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        stripe_subscription_id:
          typeof session.subscription === "string" ? session.subscription : null,
        status: "active",
      },
      { onConflict: "user_id" }
    );

    if (upsertError) {
      console.error("Subscription upsert error:", upsertError);
      return NextResponse.json(
        {
          pro: false,
          error:
            upsertError.code === "PGRST205" || upsertError.message?.includes("subscriptions")
              ? "Database not ready: run supabase/subscriptions-migration.sql and subscriptions-user-migration.sql."
              : upsertError.message ?? "Could not save subscription.",
        },
        { status: 500 }
      );
    }

    const response = NextResponse.json({ pro: true });
    response.cookies.set("stack_pro", "1", cookieOpts);
    return response;
  } catch (err) {
    console.error("Verify checkout error:", err);
    return NextResponse.json(
      { error: "Failed to verify checkout.", pro: false },
      { status: 500 }
    );
  }
}
