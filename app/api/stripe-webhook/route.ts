import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

// Use service-role key so we can write to subscriptions without a user session
// (webhook calls come from Stripe, not from a logged-in browser)
function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

// Stripe requires the raw body to verify the webhook signature
export const config = { api: { bodyParser: false } };

export async function POST(req: Request) {
  if (!stripe) {
    return NextResponse.json({ error: "Stripe not configured." }, { status: 500 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "Webhook secret not configured." }, { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let supabase: ReturnType<typeof getAdminClient>;
  try {
    supabase = getAdminClient();
  } catch (err) {
    console.error("Webhook admin client error:", err);
    return NextResponse.json({ error: "DB not configured." }, { status: 500 });
  }

  try {
    switch (event.type) {
      // ── Payment completed → grant Pro ───────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId =
          (session.metadata?.supabase_user_id as string | undefined) ??
          (session.client_reference_id as string | undefined);

        if (!userId) {
          console.warn("checkout.session.completed: no supabase_user_id in metadata");
          break;
        }

        const { error } = await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_session_id: session.id,
            stripe_customer_id:
              typeof session.customer === "string" ? session.customer : null,
            stripe_subscription_id:
              typeof session.subscription === "string" ? session.subscription : null,
            status: "active",
          },
          { onConflict: "user_id" }
        );

        if (error) {
          console.error("checkout.session.completed upsert error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log(`✓ Pro granted: user ${userId}`);
        break;
      }

      // ── Subscription cancelled → revoke Pro ─────────────────────────
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

        if (!customerId) {
          console.warn("customer.subscription.deleted: no customer ID");
          break;
        }

        const { error } = await supabase
          .from("subscriptions")
          .update({ status: "cancelled" })
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error("customer.subscription.deleted update error:", error);
          return NextResponse.json({ error: error.message }, { status: 500 });
        }

        console.log(`✓ Pro revoked: customer ${customerId}`);
        break;
      }

      // ── Subscription updated (e.g. unpaid, paused) ───────────────────
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

        if (!customerId) break;

        // Map Stripe statuses → our simplified status
        const status =
          sub.status === "active" || sub.status === "trialing"
            ? "active"
            : "cancelled";

        await supabase
          .from("subscriptions")
          .update({ status })
          .eq("stripe_customer_id", customerId);

        console.log(`✓ Subscription updated: customer ${customerId} → ${status}`);
        break;
      }

      default:
        // Ignore unhandled event types
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return NextResponse.json({ error: "Handler failed." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
