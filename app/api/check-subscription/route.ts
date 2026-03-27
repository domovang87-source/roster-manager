import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
    : null;

export async function GET(req: Request) {
  const cookieHeader = req.headers.get("cookie") ?? "";
  if (cookieHeader.includes("stack_pro=1")) {
    return NextResponse.json({ pro: true });
  }

  if (!supabase) {
    return NextResponse.json({ pro: false });
  }

  const { data, error } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("status", "active")
    .limit(1);

  if (error) {
    console.error("Check subscription error:", error);
    return NextResponse.json({ pro: false });
  }

  const pro = (data ?? []).length > 0;
  const response = NextResponse.json({ pro });
  if (pro) {
    response.cookies.set("stack_pro", "1", {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
