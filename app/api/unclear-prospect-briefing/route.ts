import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isUuid } from "@/lib/security/uuid";

type Body = { prospect_id?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const prospect_id = typeof body.prospect_id === "string" ? body.prospect_id.trim() : "";
  if (!prospect_id || !isUuid(prospect_id)) {
    return NextResponse.json({ error: "Missing or invalid prospect_id." }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase
    .from("prospects")
    .update({ briefing_cleared_at: null })
    .eq("id", prospect_id)
    .eq("user_id", user.id);

  if (error) {
    if (error.message?.includes("briefing_cleared_at") || error.message?.includes("column")) {
      return NextResponse.json(
        {
          error:
            "Database missing briefing_cleared_at — run supabase/prospects-briefing-cleared-migration.sql",
        },
        { status: 500 }
      );
    }
    console.error("unclear-prospect-briefing:", error);
    return NextResponse.json({ error: "Failed to update prospect." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
