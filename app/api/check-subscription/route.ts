import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

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

export async function GET(_req: Request) {
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

  if (!user) {
    // Not logged in — clear any stale Pro cookie
    const res = NextResponse.json({ pro: false });
    res.cookies.set("stack_pro", "", clearCookieOpts);
    return res;
  }

  // Always check the DB — never trust the incoming cookie
  let { data, error } = await supabase
    .from("subscriptions")
    .select("id, plan_tier")
    .eq("status", "active")
    .eq("user_id", user.id)
    .limit(1);

  if (
    error &&
    (error.message?.includes("plan_tier") || error.message?.includes("column"))
  ) {
    const fb = await supabase
      .from("subscriptions")
      .select("id")
      .eq("status", "active")
      .eq("user_id", user.id)
      .limit(1);
    data = fb.data as typeof data;
    error = fb.error;
  }

  if (error) {
    console.error("Check subscription error:", error);
    // Can't verify — don't grant Pro, but also don't clear (might be a transient error)
    return NextResponse.json({ pro: false, elite: false, lookupFailed: true });
  }

  const row = (data ?? [])[0] as { id?: string; plan_tier?: string } | undefined;
  const pro = Boolean(row);
  const elite = pro && row?.plan_tier === "elite";
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
