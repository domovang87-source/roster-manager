import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { resolvePaidAccessForUser } from "@/lib/subscription-status-server";
import { RATE } from "@/lib/security/rate-limit";
import { rateLimitExceeded } from "@/lib/security/rate-limit-response";

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

export async function GET(req: Request) {
  let supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    supabase = await createServerSupabase();
  } catch (e) {
    console.error("check-subscription Supabase init:", e);
    return NextResponse.json({ pro: false, lookupFailed: true });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const limited = rateLimitExceeded(
    req,
    user?.id ?? null,
    "check-subscription",
    RATE.checkSubscription.max,
    RATE.checkSubscription.windowMs
  );
  if (limited) return limited;

  if (!user) {
    // Not logged in — clear any stale Pro cookie
    const res = NextResponse.json({ pro: false });
    res.cookies.set("stack_pro", "", clearCookieOpts);
    return res;
  }

  let pro = false;
  let elite = false;
  try {
    const access = await resolvePaidAccessForUser(supabase, user.id);
    pro = access.pro;
    elite = access.elite;
  } catch (e) {
    console.error("Check subscription / profiles merge:", e);
    return NextResponse.json({ pro: false, elite: false, lookupFailed: true });
  }
  const response = NextResponse.json({ pro, elite });

  if (pro) {
    response.cookies.set("stack_pro", "1", cookieOpts);
    if (elite) {
      response.cookies.set("stack_elite", "1", cookieOpts);
    } else {
      response.cookies.set("stack_elite", "", clearCookieOpts);
    }
  } else {
    // Definitively not Pro — clear the cookie server-side too
    response.cookies.set("stack_pro", "", clearCookieOpts);
    response.cookies.set("stack_elite", "", clearCookieOpts);
  }

  return response;
}
