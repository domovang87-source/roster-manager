import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { FREE_ROSTER_SLOTS } from "@/lib/free-tier";
import { resolvePaidAccessForUser } from "@/lib/subscription-status-server";

type Tier = "A" | "B" | "C";

export async function POST(req: Request) {
  let supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    supabase = await createServerSupabase();
  } catch (e) {
    console.error("prospects API Supabase init:", e);
    return NextResponse.json({ error: "Server not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await req.json()) as {
    name?: string;
    tier?: string;
    phone_number?: string | null;
  };

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const tier: Tier =
    body.tier === "A" || body.tier === "B" || body.tier === "C" ? body.tier : "B";
  const phone =
    typeof body.phone_number === "string" && body.phone_number.trim()
      ? body.phone_number.trim()
      : null;

  const { pro: isPro } = await resolvePaidAccessForUser(supabase, user.id);

  // Never use `.eq("user_id", …)` alone for the cap: legacy inserts often have user_id NULL,
  // so the DB would report 0 owned rows while the UI still shows people → unlimited adds.
  // Fetch id + user_id and count rows that belong to this user. If RLS is wide open, we
  // still only count matching user_id (safe multi-tenant); if RLS is user-scoped, same result.
  const { data: prospectRows, error: listErr } = await supabase
    .from("prospects")
    .select("id,user_id");

  if (listErr) {
    console.error("prospects API list for limit:", listErr);
    return NextResponse.json({ error: "Could not verify roster size." }, { status: 500 });
  }

  const uid = user.id;
  const n = (prospectRows ?? []).filter((r) => r.user_id != null && String(r.user_id) === uid)
    .length;
  if (!isPro && n >= FREE_ROSTER_SLOTS) {
    return NextResponse.json(
      {
        error: "Free tier includes one person on your roster. Upgrade to add more.",
        code: "ROSTER_LIMIT",
      },
      { status: 403 }
    );
  }

  const { data: row, error: insertError } = await supabase
    .from("prospects")
    .insert({
      name,
      tier,
      phone_number: phone,
      user_id: user.id,
    })
    .select("id,name,tier,vibe_notes,phone_number")
    .single();

  if (insertError || !row) {
    console.error("prospects API insert:", insertError);
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to create prospect." },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: row });
}
