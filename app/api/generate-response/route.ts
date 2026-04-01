import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { createServerSupabase } from "@/lib/supabase/server";
import { RATE } from "@/lib/security/rate-limit";
import { rateLimitExceeded } from "@/lib/security/rate-limit-response";
import { LIMITS, clampStr } from "@/lib/security/input-limits";
import { isUuid } from "@/lib/security/uuid";
import { FREE_AI_DRAFTS, FREE_ROSTER_SLOTS } from "@/lib/free-tier";
import {
  countOwnedProspectsForUser,
  countScheduledDraftsForUserProspects,
} from "@/lib/prospect-count-server";
import { resolvePaidAccessForUser } from "@/lib/subscription-status-server";
import { buildPlaybookRagBlock } from "@/lib/playbook-rag";
import { STACK_DRAFT_KERNEL } from "@/lib/stack-draft-kernel";

type Tier = "A" | "B" | "C";

type RequestBody = {
  tier: Tier;
  name: string;
  vibeNotes?: string;
  incomingText: string;
  prospectId?: string;
  /** When true, the user sent the last text — do not frame the draft as a reply to an unanswered inbound. */
  youTextedLast?: boolean;
  /** Elite-only tone modifier (ignored when absent). */
  toneStyle?: string;
  /** True when refreshing an existing card draft — free tier is first generation only. */
  regenerate?: boolean;
};

const TONE_STYLE_HINTS: Record<string, string> = {
  balanced: "Keep the tier voice; stay natural and socially calibrated.",
  playful: "Light teasing and fun energy — witty, never try-hard or corny.",
  dominant: "Lead the frame: confident, direct, composed — no neediness or over-explaining.",
  warm: "Genuine warmth and emotional availability without sounding soft or apologetic.",
  minimal: "Ultra-brevity: one tight line when possible; cool, low-effort presence.",
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
  if (diffMs < 0) {
    return d.toLocaleDateString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
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

type ActivityRow = {
  body: string | null;
  event_type: string | null;
  direction: string | null;
  created_at: string;
};

async function getActivityContext(
  supabase: SupabaseClient,
  prospectId: string,
  limit = 10
): Promise<string> {
  const { data } = await supabase
    .from("messages")
    .select("body,event_type,direction,created_at")
    .eq("prospect_id", prospectId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const rows = (data ?? []) as ActivityRow[];
  if (rows.length === 0) return "";

  return rows
    .reverse()
    .map((row) => {
      const ago = timeAgo(row.created_at);
      const label = EVENT_LABELS[row.event_type ?? ""] ?? row.event_type ?? "Texted";
      const dir = row.direction === "inbound" ? " (them)" : row.direction === "outbound" ? " (you)" : "";
      return `[${ago}] ${label}${dir}: ${row.body ?? ""}`;
    })
    .join("\n");
}

export async function POST(req: Request) {
  let supabase: Awaited<ReturnType<typeof createServerSupabase>>;
  try {
    supabase = await createServerSupabase();
  } catch {
    return NextResponse.json(
      { error: "Supabase is not configured." },
      { status: 500 }
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const limited = rateLimitExceeded(
    req,
    user.id,
    "generate-draft",
    RATE.generateDraft.max,
    RATE.generateDraft.windowMs
  );
  if (limited) return limited;

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const {
    tier,
    name,
    vibeNotes,
    incomingText,
    prospectId,
    toneStyle,
    youTextedLast,
    regenerate,
  } = body ?? {};

  if (!tier) {
    return NextResponse.json(
      { error: "Missing tier." },
      { status: 400 }
    );
  }

  const nameClean = clampStr(
    typeof name === "string" ? name.trim() : "",
    LIMITS.draftProspectName
  );
  if (!nameClean) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  const incomingClamped =
    typeof incomingText === "string"
      ? clampStr(incomingText.trim(), LIMITS.draftIncomingText)
      : "";
  const vibeClamped =
    typeof vibeNotes === "string" && vibeNotes.trim()
      ? clampStr(vibeNotes.trim(), LIMITS.draftVibeNotes)
      : undefined;

  let prospectIdClean: string | undefined;
  if (prospectId != null && String(prospectId).trim() !== "") {
    const pid = String(prospectId).trim();
    if (!isUuid(pid)) {
      return NextResponse.json({ error: "Invalid prospect." }, { status: 400 });
    }
    prospectIdClean = pid;
  }

  const paidAccess = await resolvePaidAccessForUser(supabase, user.id);
  const isPro = paidAccess.pro;
  const regenerating = regenerate === true;
  const ownedProspects = await countOwnedProspectsForUser(supabase, user.id);

  if (!isPro && ownedProspects > FREE_ROSTER_SLOTS) {
    return NextResponse.json(
      {
        error:
          "Free tier is 1 person on your roster. Upgrade to Pro to generate drafts and keep using Stack with your current roster.",
        code: "ROSTER_OVER_FREE_LIMIT",
      },
      { status: 403 }
    );
  }

  if (!isPro && regenerating) {
    return NextResponse.json(
      {
        error: "Regenerating a draft requires Pro. Free tier includes one initial generation per account.",
        code: "REGENERATE_REQUIRES_PRO",
      },
      { status: 403 }
    );
  }

  if (!isPro && !regenerating) {
    const draftCount = await countScheduledDraftsForUserProspects(supabase, user.id);
    if (draftCount >= FREE_AI_DRAFTS) {
      return NextResponse.json(
        {
          error: "Free tier includes one AI draft. Upgrade for unlimited drafts and regenerations.",
          code: "DRAFT_LIMIT",
        },
        { status: 403 }
      );
    }
  }

  const openai = getOpenAIClient();
  if (!openai) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 400 }
    );
  }

  const activityLog = prospectIdClean
    ? await getActivityContext(supabase, prospectIdClean)
    : "";

  const { data: ruleData, error: ruleError } = await supabase
    .from("tier_rules")
    .select("voice_profile")
    .eq("tier", tier)
    .eq("user_id", user.id)
    .maybeSingle();

  if (ruleError) {
    return NextResponse.json(
      { error: "Failed to load tier rules." },
      { status: 500 }
    );
  }

  const voiceProfile =
    typeof ruleData?.voice_profile === "string" && ruleData.voice_profile.trim()
      ? ruleData.voice_profile.trim()
      : "Confident, concise, classy.";
  const toneKey =
    paidAccess.elite && typeof toneStyle === "string"
      ? clampStr(toneStyle.trim().toLowerCase(), LIMITS.toneStyle)
      : "";
  const toneExtra =
    toneKey && TONE_STYLE_HINTS[toneKey] ? ` Tone override: ${TONE_STYLE_HINTS[toneKey]}` : "";

  const contextBlock = [
    `Prospect: ${nameClean}`,
    vibeClamped ? `Notes: ${vibeClamped}` : null,
    activityLog ? `\nRecent activity log:\n${activityLog}` : null,
    incomingClamped && !youTextedLast ? `\nLatest message from them: "${incomingClamped}"` : null,
    youTextedLast
      ? "\nThread status: The user already sent the last text in this thread. Suggest only an optional follow-up or check-in if it fits the log — not a reply as if the other person is waiting on an answer."
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const ragQuery = [
    incomingClamped && !youTextedLast ? `Their last message: ${incomingClamped}` : "",
    youTextedLast ? "Thread: user texted last; optional follow-up or check-in only if appropriate." : "",
    vibeClamped ? `Context notes: ${vibeClamped}` : "",
    activityLog ? `Recent activity:\n${activityLog.slice(-2500)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 6000);

  const playbookBlock = await buildPlaybookRagBlock(openai, supabase, ragQuery);

  const systemPrompt = [
    STACK_DRAFT_KERNEL,
    playbookBlock ? `\n${playbookBlock}` : "",
    "\nYou are a texting assistant for the user's dating roster. ",
    `Voice style: ${voiceProfile}.${toneExtra} `,
    "Draft one short, natural message they can send. ",
    "Use notes and activity history. ",
    "If there's been no contact in a while, a casual re-engagement is fine. ",
    "When the user already sent the last message, only a light ping or new hook if the log supports it. ",
    "OUTPUT RULES: Return exactly one SMS-style message (one line or one short paragraph). ",
    "No headings, no numbered lists, no 'Diagnosis' / 'Move' / multi-section coaching. ",
    "Do not wrap the entire message in quotation marks.",
  ].join("");

  const userPrompt = `${contextBlock}\n\nDraft a text to send to ${nameClean}.`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const draft =
      completion.choices[0]?.message?.content?.trim() ||
      `Hey ${nameClean}, been a minute. What's good?`;

    return NextResponse.json({ tier, draft, suggestedReply: draft, autoReply: draft });
  } catch (err) {
    console.error("OpenAI error:", err);
    return NextResponse.json(
      { error: "Failed to generate draft." },
      { status: 500 }
    );
  }
}
