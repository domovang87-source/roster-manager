import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const cookieOpts = {
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export async function GET(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ pro: false });
  }

  const cookieHeader = req.headers.get("cookie") ?? "";
  if (cookieHeader.includes("stack_pro=1")) {
    return NextResponse.json({ pro: true });
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("status", "active")
    .eq("user_id", user.id)
    .limit(1);

  if (error) {
    console.error("Check subscription error:", error);
    return NextResponse.json({ pro: false, lookupFailed: true });
  }

  const pro = (data ?? []).length > 0;
  const response = NextResponse.json({ pro });
  if (pro) {
    response.cookies.set("stack_pro", "1", cookieOpts);
  }
  return response;
}
