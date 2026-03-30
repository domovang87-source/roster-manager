import {
  charismaAdjustFromVibeNotes,
  inboundRepairAndAffectionScore,
  outboundConflictIntensity,
  repairBonusForScore,
} from "./charisma-context-signals";

export type MomentumTierABC = "A" | "B" | "C";

/** Optional prospect vibe + recent logged bubbles for context-aware scoring. */
export type ThreadMomentumContextInput = {
  vibeNotes?: string;
  recentInboundTextBodies?: string[];
  recentOutboundTextBodies?: string[];
};

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
 * Intuitive 0–100: start at 80 (neutral once there’s data — not “A+ by default”).
 * Subtract for overdue rhythm, lopsided logs, tapback chase, tiny last line from them.
 * When you texted last, subtract for time waiting + stacked pings since their last real line
 * (open loop on their side — high scores need reciprocity, not only clean cadence on yours).
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
  trailSignals?: ThreadTrailSignals,
  context?: ThreadMomentumContextInput
): number {
  if (total === 0) return 0;

  const vibe = charismaAdjustFromVibeNotes(context?.vibeNotes);
  const repairScore = inboundRepairAndAffectionScore(context?.recentInboundTextBodies ?? []);
  const conflictScore = outboundConflictIntensity(context?.recentOutboundTextBodies ?? []);

  let score = 80;
  const goal = Math.max(1, Math.min(90, remindAfterDays));

  let overdueSub = 0;
  if (!lastOutboundAt) {
    overdueSub = 38;
  } else {
    const days = daysSinceLastText(lastOutboundAt, now);
    const ratio = days / goal;
    if (ratio > 1) {
      overdueSub += Math.min(52, Math.round((ratio - 1) * 48));
    }
    if (ratio > 1.45) {
      overdueSub += Math.min(18, Math.round((ratio - 1.45) * 28));
    }
  }
  score -= Math.round(overdueSub * (1 - vibe.cadenceRelief * 0.92));

  const ib = inboundText + inboundNoteCredit;
  const ob = outboundText;
  const sum = ib + ob;
  let imbalanceSub = 0;
  if (sum >= 3) {
    const u = Math.min(ib, ob) / Math.max(ib, ob);
    if (tier === "A" && u < 0.32) {
      imbalanceSub = Math.round(Math.min(28, (0.32 - u) * 55));
    } else if (tier === "B" && u < 0.26) {
      imbalanceSub = Math.round(Math.min(24, (0.26 - u) * 50));
    } else if (tier === "C" && u < 0.24) {
      imbalanceSub = Math.round(Math.min(22, (0.24 - u) * 48));
    }
  } else if (sum >= 1 && sum < 3) {
    imbalanceSub = 6;
  }
  score -= Math.round(imbalanceSub * (1 - vibe.imbalanceRelief));

  const chaseMetrics = tapbackChaseMetrics(
    trailSignals,
    latestDirection,
    inboundText,
    outboundText
  );
  const { chase, run } = chaseMetrics;

  if (latestDirection === "outbound" && lastOutboundAt && !chase) {
    const daysWaiting = daysSinceLastText(lastOutboundAt, now);
    const runSince = trailSignals?.outboundRunSinceTheirText ?? 0;
    let waitPenalty = Math.min(16, daysWaiting * 4);
    if (runSince >= 2) {
      waitPenalty += 10 + Math.min(18, Math.max(0, runSince - 2) * 8);
    }
    waitPenalty *= 1 - vibe.openLoopRelief;
    score -= Math.round(waitPenalty);
  }

  const bonusRaw = Math.min(8, noteCount * 2 + touchBaseCount * 3);
  score = Math.min(100, score + (chase ? 0 : bonusRaw));

  if (latestDirection === "inbound" && isVeryShortInboundBody(lastInboundPreview)) {
    const soloRepair = inboundRepairAndAffectionScore(lastInboundPreview ? [lastInboundPreview] : []);
    const shortPen = soloRepair >= 30 ? 9 : 20;
    score -= shortPen;
  }

  let pursuitSub = pursuitFrictionPenalty(latestDirection, inboundText, outboundText, trailSignals);
  pursuitSub = Math.round(pursuitSub * (1 - vibe.imbalanceRelief * 0.45));
  score -= pursuitSub;

  if (chase) {
    let cap = run >= 4 ? 62 : run >= 3 ? 70 : 76;
    if (inboundText === 0) cap = Math.min(cap, 64);
    if (vibe.openLoopRelief > 0.15) {
      cap = Math.min(100, Math.round(cap + vibe.openLoopRelief * 10));
    }
    score = Math.min(score, cap);
  }

  score += repairBonusForScore(latestDirection, repairScore, conflictScore);

  return Math.min(100, Math.max(0, Math.round(score)));
}
