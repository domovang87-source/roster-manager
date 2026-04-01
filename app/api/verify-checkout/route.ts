import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createServerSupabase } from "@/lib/supabase/server";
import { RATE } from "@/lib/security/rate-limit";
import { rateLimitExceeded } from "@/lib/security/rate-limit-response";
import { LIMITS } from "@/lib/security/input-limits";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

const cookieOpts = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

const clearCookieOpts = {
  path: "/",
  maxAge: 0,
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

  const limited = rateLimitExceeded(
    req,
    user.id,
    "verify-checkout",
    RATE.verifyCheckout.max,
    RATE.verifyCheckout.windowMs
  );
  if (limited) return limited;

  let body: { session_id?: string };
  try {
    body = (await req.json()) as { session_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON.", pro: false }, { status: 400 });
  }

  const session_id =
    typeof body.session_id === "string" ? body.session_id.trim().slice(0, LIMITS.checkoutSessionId) : "";

  if (!session_id) {
    return NextResponse.json({ error: "Missing session_id.", pro: false }, { status: 400 });
  }

  if (!/^cs_[a-zA-Z0-9_]+$/.test(session_id)) {
    return NextResponse.json({ error: "Invalid session_id.", pro: false }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.status !== "complete") {
      return NextResponse.json({ pro: false, elite: false, reason: "not_complete" });
    }

    const refId = session.client_reference_id ?? undefined;
    const metaId =
      typeof session.metadata?.supabase_user_id === "string"
        ? session.metadata.supabase_user_id
        : undefined;
    if (refId && refId !== user.id) {
      return NextResponse.json(
        {
          pro: false,
          elite: false,
          error: "This checkout belongs to another account. Sign in with the one you used to pay.",
        },
        { status: 403 }
      );
    }
    if (metaId && metaId !== user.id) {
      return NextResponse.json(
        {
          pro: false,
          elite: false,
          error: "This checkout belongs to another account. Sign in with the one you used to pay.",
        },
        { status: 403 }
      );
    }
    if (!refId && !metaId) {
      return NextResponse.json(
        {
          pro: false,
          elite: false,
          error: "This checkout session cannot be tied to an account. Contact support if you were charged.",
        },
        { status: 400 }
      );
    }

    const planTier = session.metadata?.tier === "elite" ? "elite" : "pro";

    const { error: upsertError } = await supabase.from("subscriptions").upsert(
      {
        user_id: user.id,
        stripe_session_id: session_id,
        stripe_customer_id: typeof session.customer === "string" ? session.customer : null,
        stripe_subscription_id:
          typeof session.subscription === "string" ? session.subscription : null,
        status: "active",
        plan_tier: planTier,
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
              ? "Database not ready: run supabase/subscriptions-migration.sql, subscriptions-user-migration.sql, and subscriptions-plan-tier-migration.sql."
              : upsertError.message ?? "Could not save subscription.",
        },
        { status: 500 }
      );
    }

    const elite = planTier === "elite";
    const response = NextResponse.json({ pro: true, elite });
    response.cookies.set("stack_pro", "1", cookieOpts);
    if (elite) {
      response.cookies.set("stack_elite", "1", cookieOpts);
    } else {
      response.cookies.set("stack_elite", "", clearCookieOpts);
    }
    return response;
  } catch (err) {
    console.error("Verify checkout error:", err);
    return NextResponse.json(
      { error: "Failed to verify checkout.", pro: false },
      { status: 500 }
    );
  }
}
