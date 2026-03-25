import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
};

type IncomingBody = {
  phone_number: string;
  body: string;
  direction?: "inbound" | "outbound";
};

export async function POST(req: Request) {
  const supabase = getClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured." },
      { status: 500 }
    );
  }

  const payload = (await req.json()) as IncomingBody;
  const phone = payload.phone_number?.trim();
  const body = payload.body?.trim();
  const direction = payload.direction ?? "inbound";

  if (!phone || !body) {
    return NextResponse.json(
      { error: "phone_number and body are required." },
      { status: 400 }
    );
  }

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id,name,tier")
    .eq("phone_number", phone)
    .maybeSingle();

  if (!prospect) {
    return NextResponse.json(
      { error: "No prospect found with that phone number.", phone_number: phone },
      { status: 404 }
    );
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      prospect_id: prospect.id,
      direction,
      body,
    })
    .select("id,prospect_id,direction,body,created_at")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Failed to store message." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    message,
    prospect: { id: prospect.id, name: prospect.name, tier: prospect.tier },
  });
}
