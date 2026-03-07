import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getSupabaseServerClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
};

export async function POST() {
  const client = getSupabaseServerClient();
  if (!client) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 400 }
    );
  }

  const { error } = await client
    .from("scheduled_replies")
    .update({ status: "sent" })
    .eq("status", "scheduled");

  if (error) {
    return NextResponse.json(
      { error: "Failed to approve scheduled replies." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
