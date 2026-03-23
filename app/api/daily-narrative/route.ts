import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getSupabaseServerClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) return null;
  return createClient(supabaseUrl, supabaseAnonKey);
};

const getOpenAIClient = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
};

export async function GET() {
  const supabase = getSupabaseServerClient();
  const openai = getOpenAIClient();

  const allClear =
    "No inbound from A Tier. No pending messages for B/C Tier.";

  if (!openai) {
    return NextResponse.json({ synopsis: allClear });
  }

  let inboundNames: string[] = [];
  let draftCount = 0;

  if (supabase) {
    try {
      const [messagesRes, draftsRes] = await Promise.all([
        supabase
          .from("messages")
          .select("direction,read_at,responded_at,prospects(name,tier)")
          .eq("direction", "inbound")
          .or("read_at.is.null,responded_at.is.null")
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("scheduled_replies")
          .select("prospects(name)")
          .eq("status", "scheduled")
          .limit(20),
      ]);
      const messages = messagesRes.data ?? [];
      const drafts = draftsRes.data ?? [];
      const seen = new Set<string>();
      messages.forEach((m) => {
        const p = m.prospects as { name?: string; tier?: string } | null;
        if (p?.tier === "A" && p?.name) {
          if (!seen.has(p.name)) {
            seen.add(p.name);
            inboundNames.push(p.name);
          }
        }
      });
      draftCount = drafts.length;
    } catch {
      /* fall through */
    }
  }

  if (inboundNames.length === 0 && draftCount === 0) {
    return NextResponse.json({ synopsis: allClear });
  }

  const activityContext =
    inboundNames.length > 0
      ? `A Tier who texted: ${inboundNames.join(", ")}.`
      : "No A Tier inbound.";
  const draftContext =
    draftCount > 0 ? `${draftCount} draft(s) waiting for approval.` : "No drafts.";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "Write a 1-2 sentence roster summary. Use the absolute minimum words. Never use: stagnation, optimize, engagement, leverage, or jargon. Format like a text: 'Zach (A Tier) texted. 4 drafts waiting for approval.' Be blunt. No fluff.",
        },
        {
          role: "user",
          content: `${activityContext} ${draftContext}\n\nOne line.`,
        },
      ],
    });
    const synopsis =
      completion.choices[0]?.message?.content?.trim() ?? allClear;
    return NextResponse.json({ synopsis });
  } catch (err) {
    console.error("OpenAI daily-narrative error:", err);
    return NextResponse.json({ synopsis: allClear });
  }
}
