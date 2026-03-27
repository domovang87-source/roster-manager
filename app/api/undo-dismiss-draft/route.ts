import { NextResponse } from "next/server";
import { createServerSupabase } from "../../../lib/supabase/server";

type Body = { draft_id?: string };

export async function POST(req: Request) {
  const { draft_id } = (await req.json()) as Body;
  if (!draft_id) {
    return NextResponse.json({ error: "Missing draft_id." }, { status: 400 });
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
    .select("id,status")
    .eq("id", draft_id)
    .single();

  if (existingError || !existing) {
    return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  }

  const { error } = await supabase
    .from("scheduled_replies")
    .update({
      status: "scheduled",
      dismissed_at: null,
    })
    .eq("id", draft_id);

  if (error) {
    return NextResponse.json({ error: "Failed to restore draft." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
