import { NextResponse } from "next/server";
import OpenAI from "openai";

const getOpenAI = () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
};

function isLikelyReactionOnly(body: string): boolean {
  const trimmed = body.trim();
  if (!trimmed) return false;
  // Common single-token reaction forms (emoji or tapback word)
  const tapbackWords = /^(heart|liked|love|laughed|emphasized|questioned|thumbs?\s?up|thumbs?\s?down)$/i;
  if (tapbackWords.test(trimmed)) return true;
  // Emoji-only line (allow spaces/joiners/variation selectors)
  const withoutEmoji = trimmed
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D\s]/gu, "")
    .trim();
  return withoutEmoji.length === 0;
}

function shortenForReaction(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57)}...`;
}

export async function POST(req: Request) {
  const openai = getOpenAI();
  if (!openai) {
    return NextResponse.json(
      { error: "OpenAI API key is not configured." },
      { status: 500 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("image") as File | null;

  if (!file) {
    return NextResponse.json(
      { error: "No image provided." },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const mimeType = file.type || "image/png";

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are analyzing a screenshot of a text/iMessage/WhatsApp conversation.\n\n" +
            "First, read the CONTACT NAME shown in the app header / title bar at the TOP of the thread (e.g. the name next to the back chevron). " +
            "Put that exact visible string in thread_title. If there is no clear single contact name, use null.\n\n" +
            "Then extract the messages you can see. For each message, determine:\n" +
            '- direction: "inbound" if the OTHER person sent it, "outbound" if the USER (phone owner) sent it\n' +
            "- body: the text content of the message\n\n" +
            "CRITICAL RULES for determining direction:\n" +
            "- RIGHT-aligned bubbles (blue, green, or colored) = outbound (the user sent it)\n" +
            "- LEFT-aligned bubbles (gray, white, or plain) = inbound (the other person sent it)\n" +
            "- If bubble colors are subtle (dark mode, custom themes), use horizontal alignment only — a wrong side breaks the app’s “who texted last” logic.\n" +
            "- Reactions/Tapbacks (heart, like, thumbs up/down, laugh, exclamation, question, emoji overlays) are NOT part of the original message text\n" +
            "- If a reaction appears, output it as a separate message event using body format: 'Reacted <emoji_or_label> to: <short quoted message>'\n" +
            "- For reactions, direction is who performed the reaction (e.g., if OTHER person heart-reacted to a RIGHT-side user bubble, that reaction direction is INBOUND)\n" +
            "- Never append reaction emoji onto the original bubble text\n" +
            "- QUOTED/REPLY messages: when someone quotes a previous message and replies below it, the ENTIRE block belongs to whoever's bubble it appears in. " +
            'A "You" label inside a quote bubble on the LEFT side means the other person is quoting the user — the reply below the quote is INBOUND, not outbound.\n' +
            "- Voice messages, audio clips, or media with no text: skip them entirely\n" +
            "- Forwarded messages belong to whoever forwarded them (the bubble side they appear on)\n\n" +
            "Return ONLY one JSON object (no markdown fences, no explanation) with this exact shape:\n" +
            '{"thread_title":"Contact Name Here" or null,"messages":[{"direction":"inbound","body":"..."},...]}\n' +
            "messages must be oldest first. If you can't read the conversation, use {\"thread_title\":null,\"messages\":[]}.",
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Read this screenshot: extract thread_title (header name) and messages as specified.",
            },
          ],
        },
      ],
      max_tokens: 1200,
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "{}";

    const cleaned = raw.replace(/^```json?\s*/i, "").replace(/```\s*$/i, "").trim();

    let messages: { direction: string; body: string }[];
    let threadTitle: string | null = null;

    try {
      const parsed: unknown = JSON.parse(cleaned);
      if (Array.isArray(parsed)) {
        messages = parsed as { direction: string; body: string }[];
      } else if (parsed && typeof parsed === "object") {
        const o = parsed as Record<string, unknown>;
        const rawTitle = o.thread_title ?? o.threadTitle;
        if (typeof rawTitle === "string") {
          const t = rawTitle.trim();
          threadTitle = t.length > 0 ? t : null;
        } else {
          threadTitle = null;
        }
        const arr = o.messages;
        messages = Array.isArray(arr) ? (arr as { direction: string; body: string }[]) : [];
      } else {
        return NextResponse.json(
          { error: "AI response was not valid JSON.", raw },
          { status: 500 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response.", raw },
        { status: 500 }
      );
    }

    if (!Array.isArray(messages)) {
      return NextResponse.json(
        { error: "AI response missing messages array.", raw },
        { status: 500 }
      );
    }

    // Post-process: convert lone reaction-like entries into explicit reaction events.
    const normalized = messages.map((m) => ({
      direction: m.direction === "inbound" ? "inbound" : "outbound",
      body: String(m.body ?? "").trim(),
    }));

    const withReactions = normalized.map((msg, idx, arr) => {
      if (!isLikelyReactionOnly(msg.body)) return msg;
      // Attach to nearest opposite-direction message (before or after).
      const candidates = arr
        .map((candidate, candidateIdx) => ({ candidate, candidateIdx }))
        .filter(
          ({ candidate, candidateIdx }) =>
            candidateIdx !== idx &&
            candidate.direction !== msg.direction &&
            candidate.body.length > 0
        )
        .map(({ candidate, candidateIdx }) => ({
          candidate,
          distance: Math.abs(candidateIdx - idx),
          isAfter: candidateIdx > idx,
        }))
        .sort((a, b) => {
          if (a.distance !== b.distance) return a.distance - b.distance;
          // If equally close, prefer the message after the reaction marker.
          if (a.isAfter === b.isAfter) return 0;
          return a.isAfter ? -1 : 1;
        });

      const target = candidates[0]?.candidate;

      if (!target) return msg;
      return {
        direction: msg.direction,
        body: `Reacted ${msg.body} to: ${shortenForReaction(target.body)}`,
      };
    });

    return NextResponse.json({ messages: withReactions, threadTitle });
  } catch (err) {
    console.error("Screenshot parse error:", err);
    return NextResponse.json(
      { error: "Failed to analyze screenshot." },
      { status: 500 }
    );
  }
}
