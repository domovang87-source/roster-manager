import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { getBearerToken, timingSafeEqualUtf8 } from "@/lib/security/timing-safe";
import { checkRateLimit, getRequestIp, RATE } from "@/lib/security/rate-limit";

type IncomingBody = {
  phone_number?: string;
  body?: string;
  direction?: "inbound" | "outbound";
};

const MAX_PHONE = 32;
const MAX_BODY = 8000;

/**
 * SMS / bridge webhook — NOT public. Set STACK_INCOMING_WEBHOOK_SECRET and send
 * Authorization: Bearer <secret>. Uses service role after lookup so RLS cannot be bypassed from the browser.
 */
export async function POST(req: Request) {
  const secret = process.env.STACK_INCOMING_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Incoming webhook is disabled. Set STACK_INCOMING_WEBHOOK_SECRET in the server environment.",
      },
      { status: 503 }
    );
  }

  const token = getBearerToken(req);
  if (!timingSafeEqualUtf8(secret, token)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const ip = getRequestIp(req);
  const rl = checkRateLimit(`incoming-msg:${ip}`, RATE.webhook.max, RATE.webhook.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let payload: IncomingBody;
  try {
    payload = (await req.json()) as IncomingBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const phone = typeof payload.phone_number === "string" ? payload.phone_number.trim() : "";
  const body = typeof payload.body === "string" ? payload.body.trim() : "";
  const direction = payload.direction === "outbound" ? "outbound" : "inbound";

  if (!phone || !body) {
    return NextResponse.json({ error: "phone_number and body are required." }, { status: 400 });
  }
  if (phone.length > MAX_PHONE || body.length > MAX_BODY) {
    return NextResponse.json({ error: "phone_number or body too long." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  const { data: matches, error: findErr } = await supabase
    .from("prospects")
    .select("id,name,tier")
    .eq("phone_number", phone)
    .limit(2);

  if (findErr) {
    return NextResponse.json({ error: "Lookup failed." }, { status: 500 });
  }

  const list = matches ?? [];
  if (list.length === 0) {
    return NextResponse.json(
      { error: "No prospect found with that phone number.", phone_number: phone },
      { status: 404 }
    );
  }
  if (list.length > 1) {
    return NextResponse.json(
      { error: "Multiple prospects share this phone — disambiguate in your provider (use prospect id)." },
      { status: 409 }
    );
  }

  const prospect = list[0]!;

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      prospect_id: prospect.id,
      direction,
      body,
    })
    .select("id,prospect_id,direction,body,created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: "Failed to store message." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message,
    prospect: { id: prospect.id, name: prospect.name, tier: prospect.tier },
  });
}
