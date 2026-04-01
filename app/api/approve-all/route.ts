import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase/admin";
import { getBearerToken, timingSafeEqualUtf8 } from "@/lib/security/timing-safe";
import { checkRateLimit, getRequestIp, RATE } from "@/lib/security/rate-limit";

/**
 * Internal / automation only. Mass-updates scheduled replies — was previously callable with no auth.
 * Set CRON_SECRET and send: Authorization: Bearer <CRON_SECRET>
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured — bulk approve is disabled." },
      { status: 503 }
    );
  }

  const token = getBearerToken(req);
  if (!timingSafeEqualUtf8(secret, token)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const ip = getRequestIp(req);
  const rl = checkRateLimit(`approve-all:${ip}`, RATE.webhook.max, RATE.webhook.windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  let supabase;
  try {
    supabase = getSupabaseServiceRoleClient();
  } catch {
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  const { error } = await supabase
    .from("scheduled_replies")
    .update({ status: "sent" })
    .eq("status", "scheduled");

  if (error) {
    return NextResponse.json({ error: "Failed to approve scheduled replies." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
