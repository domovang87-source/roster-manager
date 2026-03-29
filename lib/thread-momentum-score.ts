export type MomentumTierABC = "A" | "B" | "C";

export type ThreadTrailSignals = {
  inboundReactionCount: number;
  outboundRunSinceTheirText: number;
};

/** Light touch: note one-sided stretches without punishing double-text culture heavily. */
function pursuitFrictionPenalty(
  latestDirection: "inbound" | "outbound" | undefined,
  inboundTextLines: number,
  outboundTextLines: number,
  trail: ThreadTrailSignals | undefined
): number {
  if (latestDirection !== "outbound" || !trail) return 0;
  const run = trail.outboundRunSinceTheirText;
  const rCount = trail.inboundReactionCount;
  let p = 0;
  if (run >= 2) {
    p += Math.min(14, (run - 1) * 3);
  }
  if (inboundTextLines === 0 && rCount >= 1 && outboundTextLines >= 2) {
    p += 9;
  }
  if (inboundTextLines === 0 && outboundTextLines >= 4) {
    p += Math.min(6, 2 + (outboundTextLines - 3));
  }
  return Math.min(18, p);
}

export function isVeryShortInboundBody(body: string | undefined): boolean {
  if (!body) return false;
  const t = body.trim();
  if (t.length === 0) return false;
  if (t.length <= 12) return true;
  return t.split(/\s+/).filter(Boolean).length <= 2 && t.length <= 28;
}

function daysSinceLastText(iso: string, now: Date): number {
  const d = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  return d < 0 ? 0 : d;
}

/**
 * Intuitive 0–100: start at 100, subtract only for real friction (overdue vs Style,
 * very lopsided log, ambiguous one-word ending). Notes / voice memo credit already in ib.
 */
export function computeThreadMomentum100(
  tier: MomentumTierABC,
  total: number,
  inboundText: number,
  inboundNoteCredit: number,
  outboundText: number,
  noteCount: number,
  touchBaseCount: number,
  lastOutboundAt: string | undefined,
  remindAfterDays: number,
  now: Date,
  latestDirection: "inbound" | "outbound" | undefined,
  lastInboundPreview: string | undefined,
  trailSignals?: ThreadTrailSignals
): number {
  if (total === 0) return 0;

  let score = 100;
  const goal = Math.max(1, Math.min(90, remindAfterDays));

  if (!lastOutboundAt) {
    score -= 38;
  } else {
    const days = daysSinceLastText(lastOutboundAt, now);
    const ratio = days / goal;
    if (ratio > 1) {
      score -= Math.min(52, Math.round((ratio - 1) * 48));
    }
    if (ratio > 1.45) {
      score -= Math.min(18, Math.round((ratio - 1.45) * 28));
    }
  }

  const ib = inboundText + inboundNoteCredit;
  const ob = outboundText;
  const sum = ib + ob;
  if (sum >= 3) {
    const u = Math.min(ib, ob) / Math.max(ib, ob);
    if (tier === "A" && u < 0.32) {
      score -= Math.round(Math.min(28, (0.32 - u) * 55));
    } else if (tier === "B" && u < 0.26) {
      score -= Math.round(Math.min(24, (0.26 - u) * 50));
    } else if (tier === "C" && u < 0.24) {
      score -= Math.round(Math.min(22, (0.24 - u) * 48));
    }
  } else if (sum >= 1 && sum < 3) {
    score -= 6;
  }

  score = Math.min(100, score + Math.min(8, noteCount * 2 + touchBaseCount * 3));

  if (latestDirection === "inbound" && isVeryShortInboundBody(lastInboundPreview)) {
    score -= 20;
  }

  score -= pursuitFrictionPenalty(latestDirection, inboundText, outboundText, trailSignals);

  return Math.min(100, Math.max(0, Math.round(score)));
}
