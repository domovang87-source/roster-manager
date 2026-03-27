import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

type Tier = "A" | "B" | "C";

type RequestBody = {
  tier: Tier;
  name: string;
  vibeNotes?: string;
  incomingText: string;
  prospectId?: string;
};

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

const EVENT_LABELS: Record<string, string> = {
  text: "Texted",
  date: "Went on a date",
  hangout: "Hung out",
  call: "Called",
  note: "Note",
};

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  const weeks = Math.floor(days / 7);
  if (min < 60) return `${min} minutes ago`;
  if (hrs < 24) return `${hrs} hours ago`;
  if (days < 7) return `${days} days ago`;
  if (weeks < 5) return `${weeks} weeks ago`;
  return d.toLocaleDateString();
}

async function getActivityContext(
  supabase: ReturnType<typeof createClient>,
  prospectId: string,
  limit = 10
): Promise<string> {
  const { data } = await supabase
    .from("messages")
    .select("body,event_type,direction,created_at")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!data || data.length === 0) return "";

  return data
    .reverse()
    .map((row) => {
      const ago = timeAgo(row.created_at as string);
      const label = EVENT_LABELS[row.event_type as string] ?? row.event_type ?? "Texted";
      const dir = row.direction === "inbound" ? " (them)" : row.direction === "outbound" ? " (you)" : "";
      return `[${ago}] ${label}${dir}: ${row.body}`;
    })
    .join("\n");
}

export async function POST(req: Request) {
  const body = (await req.json()) as RequestBody;
  const { tier, name, vibeNotes, incomingText, prospectId } = body ?? {};

  if (!tier) {
    return NextResponse.json(
      { error: "Missing tier." },
      { status: 400 }
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 400 }
    );
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 400 }
    );
  }

  const activityLog = prospectId
    ? await getActivityContext(supabase, prospectId)
    : "";

  const { data: ruleData, error: ruleError } = await supabase
    .from("tier_rules")
    .select("voice_profile")
    .eq("tier", tier)
    .single();

  if (ruleError && ruleError.code !== "PGRST116") {
    return NextResponse.json(
      { error: "Failed to load tier rules." },
      { status: 500 }
    );
  }

  const voiceProfile = ruleData?.voice_profile ?? "Confident, concise, classy.";

  const contextBlock = [
    `Prospect: ${name}`,
    vibeNotes ? `Notes: ${vibeNotes}` : null,
    activityLog ? `\nRecent activity log:\n${activityLog}` : null,
    incomingText ? `\nLatest message from them: "${incomingText}"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt =
    "You are a texting assistant helping the user keep their dating roster warm. " +
    `Voice style: ${voiceProfile}. ` +
    "Draft a short, natural text message the user can send. " +
    "Use the prospect's notes and activity history to personalize it. " +
    "If there's been no contact in a while, craft a casual re-engagement text. " +
    "Keep it concise and natural — match the energy of the conversation. No quotation marks around the message.";

  const userPrompt = `${contextBlock}\n\nDraft a text to send to ${name}.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const draft = completion.choices[0]?.message?.content?.trim() || `Hey ${name}, been a minute. What's good?`;

    return NextResponse.json({ tier, draft, suggestedReply: draft, autoReply: draft });
  } catch (err) {
    console.error("OpenAI error:", err);
    return NextResponse.json(
      { error: "Failed to generate draft." },
      { status: 500 }
    );
  }
}
