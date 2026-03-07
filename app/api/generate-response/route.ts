import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

type Tier = "A" | "B" | "C";

type RequestBody = {
  tier: Tier;
  name: string;
  vibeNotes?: string;
  incomingText: string;
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

const truncateWords = (text: string, maxWords: number) => {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return `${words.slice(0, maxWords).join(" ")}...`;
};

export async function POST(req: Request) {
  const body = (await req.json()) as RequestBody;
  const { tier, name, vibeNotes, incomingText } = body ?? {};

  if (!tier || !incomingText) {
    return NextResponse.json(
      { error: "Missing tier or incoming text." },
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

  const { data, error } = await supabase
    .from("tier_rules")
    .select(
      "auto_respond,delay_min_hours,delay_max_hours,max_words,voice_profile"
    )
    .eq("tier", tier)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json(
      { error: "Failed to load tier rules." },
      { status: 500 }
    );
  }

  const maxWords = data?.max_words ?? 60;
  const delayMin = data?.delay_min_hours ?? 0.5;
  const delayMax = data?.delay_max_hours ?? 2;

  if (tier === "A") {
    const voiceProfile = data?.voice_profile ?? "Confident, concise, classy.";
    const systemPrompt =
      "You are an assistant helping a user manage their high-priority dating roster. " +
      `Based on the following Voice Profile: ${voiceProfile}, analyze the incoming text and suggest a high-status, effective reply.`;
    const userPrompt = `Incoming message:\n"${incomingText}"\n\nProspect: ${name}${vibeNotes ? `\nContext/notes: ${vibeNotes}` : ""}\n\nRespond with exactly two lines:\n1. SUMMARY: (one sentence summarizing the message)\n2. REPLY: (your suggested reply, match the voice profile)`;

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? "";
      const summaryMatch = content.match(/SUMMARY:\s*(.+?)(?=\n|$)/i);
      const replyMatch = content.match(/REPLY:\s*([\s\S]+?)(?=\n\n|$)/i);
      const summary = summaryMatch?.[1]?.trim() ?? content.split("\n")[0] ?? incomingText.slice(0, 140);
      const suggestedReply = truncateWords(
        replyMatch?.[1]?.trim() ?? content.split("\n").slice(1).join(" ").replace(/^REPLY:\s*/i, "").trim() ?? `Got it, ${name}. I'll circle back.`,
        maxWords
      );
      return NextResponse.json({ tier, summary, suggestedReply });
    } catch (err) {
      console.error("OpenAI error:", err);
      return NextResponse.json(
        { error: "Failed to generate response." },
        { status: 500 }
      );
    }
  }

  const systemPrompt =
    `Generate a brief, polite auto-reply for a B/C-Tier prospect. Keep it under ${maxWords} words. Mention a reply within ${delayMin}-${delayMax} hours. Do not be overly eager.`;
  const userPrompt = `Prospect: ${name}\n\nWrite a single short auto-reply message.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const autoReply = truncateWords(
      raw || `Thanks for the message, ${name}. I'll reply within ${delayMin}-${delayMax} hours.`,
      maxWords
    );
    return NextResponse.json({ tier, autoReply });
  } catch (err) {
    console.error("OpenAI error:", err);
    return NextResponse.json(
      { error: "Failed to generate auto-reply." },
      { status: 500 }
    );
  }
}
