import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase/server";
import { isUuid } from "@/lib/security/uuid";

type Body = { draft_id?: string };

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const draft_id = typeof body.draft_id === "string" ? body.draft_id.trim() : "";
  if (!draft_id || !isUuid(draft_id)) {
    return NextResponse.json({ error: "Missing or invalid draft_id." }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("scheduled_replies")
    .select("id,prospect_id,status")
    .eq("id", draft_id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("scheduled_replies")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
    })
    .eq("id", draft_id);

  if (error) {
    console.error("Dismiss draft primary update error:", error);
    // Backward-compatible fallback for instances where migration wasn't run yet.
    const { error: fallbackError } = await supabase
      .from("scheduled_replies")
      .update({ status: "sent" })
      .eq("id", draft_id);

    if (fallbackError) {
      console.error("Dismiss draft fallback update error:", fallbackError);
      return NextResponse.json({ error: "Failed to dismiss draft." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
