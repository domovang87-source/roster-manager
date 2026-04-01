/**
 * In-app “Ask Domo–style” coaching: same tactical shape marketed on askdomo.ai
 * (diagnosis → move → copy-paste text → two branch reads). Paired with
 * `buildPlaybookRagBlock` for the same knowledge retrieval path as Stack drafts.
 */
export const ASK_DOMO_STYLE_KERNEL = `You are a blunt, tactical dating / texting coach. Same job as the standalone Ask Domo product:
- No therapy voice, no moralizing, no long essays. Short sections only.
- Read the situation as power dynamics + social calibration, not as mind-reading.
- Give a clear diagnosis (what the pattern likely is), then the strategic move, then ONE exact text they can copy-paste.
- Then: two short lines — what to do if the reply is warm vs cold (concrete next beat, not vague).

Rules:
- If key facts are missing, say what you’re assuming in one short clause, then still give a best move.
- Do not claim you know what the other person thinks; frame reads as “pattern / likely frame.”
- Texts should sound like a real human sent them — confident, not needy, not over-explaining.
- OUTPUT MUST BE VALID JSON ONLY (no markdown fences, no prose outside JSON) matching the schema the user provides.
- If the thread already includes prior JSON coaching turns, integrate them — the user is following up. Output a full fresh JSON object for this turn (not a patch or delta).`;

export const ASK_DOMO_JSON_INSTRUCTION = `Return a single JSON object with exactly these string fields:
- "diagnosis": 1–3 sentences.
- "move": 1–3 sentences — strategic, what frame to hold.
- "text": one SMS-style message only (no quotes around the whole thing).
- "ifTheyReplyWarm": one sentence — next beat if they engage positively.
- "ifTheyReplyCold": one sentence — next beat if they’re short, vague, or pull back.`;

export type AskDomoStructured = {
  diagnosis: string;
  move: string;
  text: string;
  ifTheyReplyWarm: string;
  ifTheyReplyCold: string;
};

/** Client → API: prior assistant JSON + user follow-ups, alternating; must end with user when non-empty. */
export type AskDomoHistoryEntry =
  | { role: "assistant"; coaching: AskDomoStructured }
  | { role: "user"; content: string };

export function coachingFromUnknown(coaching: unknown): AskDomoStructured | null {
  if (!coaching || typeof coaching !== "object") return null;
  return parseAskDomoJson(JSON.stringify(coaching));
}

export function parseAskDomoHistory(raw: unknown): AskDomoHistoryEntry[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) return null;
  if (raw.length > 24) return null;
  const out: AskDomoHistoryEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const role = (item as { role?: string }).role;
    if (role === "user") {
      const content = String((item as { content?: unknown }).content ?? "").trim();
      if (content.length < 3 || content.length > 4000) return null;
      out.push({ role: "user", content });
    } else if (role === "assistant") {
      const c = coachingFromUnknown((item as { coaching?: unknown }).coaching);
      if (!c) return null;
      out.push({ role: "assistant", coaching: c });
    } else {
      return null;
    }
  }
  for (let i = 0; i < out.length; i++) {
    const want = i % 2 === 0 ? "assistant" : "user";
    if (out[i].role !== want) return null;
  }
  if (out.length > 0 && out[out.length - 1].role !== "user") return null;
  return out;
}

function historyToRagSnippet(history: AskDomoHistoryEntry[]): string {
  const parts: string[] = [];
  for (const e of history) {
    if (e.role === "user") parts.push(e.content);
    else {
      parts.push(
        [e.coaching.diagnosis, e.coaching.move, e.coaching.text].filter(Boolean).join(" · ")
      );
    }
  }
  return parts.join("\n");
}

export function buildAskDomoRagQuery(situation: string, history: AskDomoHistoryEntry[]): string {
  const h = historyToRagSnippet(history);
  return [situation, h].filter(Boolean).join("\n\n").slice(0, 8000);
}

export function parseAskDomoJson(raw: string): AskDomoStructured | null {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const diagnosis = String(o.diagnosis ?? "").trim();
    const move = String(o.move ?? "").trim();
    const text = String(o.text ?? "").trim();
    const ifTheyReplyWarm = String(o.ifTheyReplyWarm ?? "").trim();
    const ifTheyReplyCold = String(o.ifTheyReplyCold ?? "").trim();
    if (!diagnosis || !move || !text) return null;
    return {
      diagnosis,
      move,
      text,
      ifTheyReplyWarm: ifTheyReplyWarm || "Re-read the thread; one calm line or silence.",
      ifTheyReplyCold: ifTheyReplyCold || "Match their temperature; don’t double down.",
    };
  } catch {
    return null;
  }
}
