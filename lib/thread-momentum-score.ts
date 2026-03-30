export type MomentumTierABC = "A" | "B" | "C";

export type ThreadTrailSignals = {
  inboundReactionCount: number;
  outboundRunSinceTheirText: number;
  /**
   * Text reacts in the current “your streak” window (newest-first): leading reacts after your texts,
   * plus any sandwiched between your outbound lines — excludes old-thread noise.
   */
  tapbacksDuringYourStreak: number;
};

/**
 * Text-react chase: streak metric and inferred chase when reacts exist + you’re clearly carrying the thread.
 */
export function tapbackChaseMetrics(
  trail: ThreadTrailSignals | undefined,
  latestDirection: "inbound" | "outbound" | undefined,
  inboundTextLines: number,
  outboundTextLines: number
): { tbEff: number; run: number; rCount: number; chase: boolean } {
  if (latestDirection !== "outbound" || !trail) {
    return { tbEff: 0, run: 0, rCount: 0, chase: false };
  }
  const run = trail.outboundRunSinceTheirText;
  const rCount = trail.inboundReactionCount;
  const tbRaw = trail.tapbacksDuringYourStreak ?? 0;
  let tbEff = tbRaw;
  if (tbEff < 1 && rCount >= 1 && run >= 2 && inboundTextLines === 0 && outboundTextLines >= 2) {
    tbEff = 1;
  }
  if (
    tbEff < 1 &&
    rCount >= 1 &&
    run >= 3 &&
    outboundTextLines >= 3 &&
    outboundTextLines >= inboundTextLines + 2
  ) {
    tbEff = 1;
  }
  const chase = run >= 2 && tbEff >= 1;
  return { tbEff, run, rCount, chase };
}

/**
 * One-sided stretches. When they only text-react while you send real lines, penalties are heavier (not capped at 18).
 */
function pursuitFrictionPenalty(
  latestDirection: "inbound" | "outbound" | undefined,
  inboundTextLines: number,
  outboundTextLines: number,
  trail: ThreadTrailSignals | undefined
): number {
  if (latestDirection !== "outbound" || !trail) return 0;
  const { tbEff, run, rCount } = tapbackChaseMetrics(
    trail,
    latestDirection,
    inboundTextLines,
    outboundTextLines
  );

  if (tbEff >= 1 && run >= 2) {
    let p = 22 + (run - 2) * 11 + Math.min(16, tbEff * 5);
    if (inboundTextLines === 0) p += 14;
    return Math.min(56, p);
  }

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

  const { chase, tbEff, run } = tapbackChaseMetrics(
    trailSignals,
    latestDirection,
    inboundText,
    outboundText
  );
  const bonusRaw = Math.min(8, noteCount * 2 + touchBaseCount * 3);
  score = Math.min(100, score + (chase ? 0 : bonusRaw));

  if (latestDirection === "inbound" && isVeryShortInboundBody(lastInboundPreview)) {
    score -= 20;
  }

  score -= pursuitFrictionPenalty(latestDirection, inboundText, outboundText, trailSignals);

  if (chase) {
    let cap = run >= 4 ? 62 : run >= 3 ? 70 : 76;
    if (inboundText === 0) cap = Math.min(cap, 64);
    score = Math.min(score, cap);
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}
