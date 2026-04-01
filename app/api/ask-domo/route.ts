import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";
import { RATE } from "@/lib/security/rate-limit";
import { rateLimitExceeded } from "@/lib/security/rate-limit-response";
import { resolvePaidAccessForUser } from "@/lib/subscription-status-server";
import { buildPlaybookRagBlock } from "@/lib/playbook-rag";
import {
  ASK_DOMO_JSON_INSTRUCTION,
  ASK_DOMO_STYLE_KERNEL,
  buildAskDomoRagQuery,
  parseAskDomoHistory,
  parseAskDomoJson,
  type AskDomoHistoryEntry,
} from "@/lib/ask-domo-kernel";

type Body = { situation?: string; history?: unknown };

const getOpenAI = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
};

const MAX_SITUATION = 6000;

const FOLLOWUP_USER_SUFFIX =
  "\n\nAgain: output the same JSON schema (diagnosis, move, text, ifTheyReplyWarm, ifTheyReplyCold) for this follow-up. JSON only.";

function openAiMessagesFromThread(
  systemContent: string,
  situation: string,
  history: AskDomoHistoryEntry[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemContent },
    {
      role: "user",
      content: `Situation (user-described):\n${situation}\n\nRespond with the JSON object only.`,
    },
  ];
  for (const h of history) {
    if (h.role === "assistant") {
      messages.push({ role: "assistant", content: JSON.stringify(h.coaching) });
    } else {
      messages.push({ role: "user", content: `${h.content}${FOLLOWUP_USER_SUFFIX}` });
    }
  }
  return messages;
}

export async function POST(req: Request) {
  let supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    supabase = await createServerSupabase();
  } catch {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 500 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in.", code: "AUTH" }, { status: 401 });
  }

  const limited = rateLimitExceeded(req, user.id, "ask-domo", RATE.askDomo.max, RATE.askDomo.windowMs);
  if (limited) return limited;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const situation = typeof body.situation === "string" ? body.situation.trim() : "";
  if (situation.length < 12) {
    return NextResponse.json(
      { error: "Describe the situation in a bit more detail (at least a sentence or two)." },
      { status: 400 }
    );
  }
  if (situation.length > MAX_SITUATION) {
    return NextResponse.json({ error: "Situation is too long — shorten and try again." }, { status: 400 });
  }

  const history = parseAskDomoHistory(body.history);
  if (history === null) {
    return NextResponse.json({ error: "Invalid conversation history." }, { status: 400 });
  }

  const paid = await resolvePaidAccessForUser(supabase, user.id);
  if (!paid.pro) {
    return NextResponse.json(
      {
        error: "Ask Domo–style coaching is included with Stack Pro. Upgrade to use it in-app.",
        code: "ASK_DOMO_PRO_ONLY",
      },
      { status: 403 }
    );
  }

  const openai = getOpenAI();
  if (!openai) {
    return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 });
  }

  const ragQuery = buildAskDomoRagQuery(situation, history);
  const playbookBlock = await buildPlaybookRagBlock(openai, supabase, ragQuery);

  const systemContent = [
    ASK_DOMO_STYLE_KERNEL,
    playbookBlock ? `\n${playbookBlock}` : "",
    "\n",
    ASK_DOMO_JSON_INSTRUCTION,
  ].join("");

  const messages = openAiMessagesFromThread(systemContent, situation, history);

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages,
    });

    let raw = completion.choices[0]?.message?.content?.trim() ?? "";
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const parsed = parseAskDomoJson(raw);
    if (!parsed) {
      return NextResponse.json(
        { error: "Couldn’t parse coaching response — try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({ coaching: parsed });
  } catch (e) {
    console.error("[ask-domo]", e);
    return NextResponse.json({ error: "Failed to generate coaching." }, { status: 500 });
  }
}
