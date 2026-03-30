/**
 * Short teaser + popover copy for thread momentum (0–100).
 * Scoring lives in thread-momentum-score + roster-portfolio-compute.
 */

import {
  isVeryShortInboundBody,
  tapbackChaseMetrics,
  type ThreadTrailSignals,
} from "./thread-momentum-score";

export type MomentumTier = "A" | "B" | "C";

export type MomentumContext = {
  tier: MomentumTier;
  remindAfterDays: number;
  inbound: number;
  outbound: number;
  inboundText?: number;
  inboundNoteCredit?: number;
  outboundText?: number;
  total: number;
  noteCount: number;
  touchBaseCount: number;
  lastInboundAt?: string;
  lastOutboundAt?: string;
  lastInboundPreview?: string;
  /** Latest outbound text body — used to mention soft invites in “Why”. */
  lastOutboundPreview?: string;
  /** Most recent outbound note (any) — for copy when the thread story lives in notes. */
  latestOutboundNotePreview?: string;
  /** Style cadence anchor came from a qualifying note (meet/call/date/hangout language). */
  cadenceFromNote?: boolean;
  latestDirection?: "inbound" | "outbound";
  latestAt?: string;
  /** Inbound rows that are text reacts / Screen Time reaction lines, not written replies. */
  inboundReactionCount?: number;
  /** Outbound texts in a row since their last real written line (text reacts skipped). */
  outboundRunSinceTheirText?: number;
  /** Text reacts logged during your current outbound streak (not old-thread noise). */
  tapbacksDuringYourStreak?: number;
};

function tapbackChaseFromContext(ctx: MomentumContext): boolean {
  const trail: ThreadTrailSignals = {
    inboundReactionCount: ctx.inboundReactionCount ?? 0,
    outboundRunSinceTheirText: ctx.outboundRunSinceTheirText ?? 0,
    tapbacksDuringYourStreak: ctx.tapbacksDuringYourStreak ?? 0,
  };
  return tapbackChaseMetrics(
    trail,
    ctx.latestDirection,
    ctx.inboundText ?? 0,
    ctx.outboundText ?? 0
  ).chase;
}

function shortAgo(iso: string, now: Date): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (diffMs < 0) return "just now";
  const min = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 14) return `${days}d ago`;
  return `${Math.floor(days / 7)}wk ago`;
}

function fullDaysSince(iso: string | undefined, now: Date): number | null {
  if (!iso) return null;
  const diffMs = now.getTime() - new Date(iso).getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 86_400_000);
}

function isCadenceOverdue(ctx: MomentumContext, now: Date): boolean {
  if (!ctx.lastOutboundAt) return true;
  const d = fullDaysSince(ctx.lastOutboundAt, now);
  if (d === null) return false;
  const goal = Math.max(1, ctx.remindAfterDays);
  return d > Math.ceil(goal * 1.06);
}

/** Topic snippet from your last logged outbound (screenshot tail) — not full thread history. */
function lastOutboundTopicSnippet(lastOutbound: string | undefined): string | null {
  if (!lastOutbound?.trim()) return null;
  const t = lastOutbound.toLowerCase();
  if (/\b(cafe|coffee|latte|espresso)\b/.test(t)) return "a café / coffee thing";
  if (/\b(drinks?|wine|bar)\b/.test(t)) return "drinks";
  if (/\b(lunch|brunch|dinner|eat|food|bite|grab)\b/.test(t)) return "food or a bite";
  if (/\b(hang|hangout|pull up|link up|meet|meetup|see you|come through|slide)\b/.test(t)) {
    return "hanging out or meeting up";
  }
  return null;
}

/** One short line beside the number. */
export function momentumTeaser(name: string, score: number, ctx: MomentumContext | undefined, now = new Date()): string {
  if (!ctx || ctx.total === 0) return "Tap for details";

  if (ctx.latestDirection === "inbound" && isVeryShortInboundBody(ctx.lastInboundPreview)) {
    return "Last line was tiny · tap";
  }

  if (ctx.latestDirection === "inbound" && ctx.latestAt) {
    return `They texted last · ${shortAgo(ctx.latestAt, now)}`;
  }

  if (ctx.latestDirection === "outbound" && ctx.latestAt) {
    const run = ctx.outboundRunSinceTheirText ?? 0;
    const ibt = ctx.inboundText ?? ctx.inbound;
    const r = ctx.inboundReactionCount ?? 0;
    const youVerb = ctx.cadenceFromNote ? "You logged last" : "You texted last";
    if (tapbackChaseFromContext(ctx)) {
      return `You’re carrying it · text reacts only · ${shortAgo(ctx.latestAt, now)}`;
    }
    if (ibt === 0 && r >= 1 && (ctx.outboundText ?? 0) >= 2) {
      return `They liked, didn’t type · ${shortAgo(ctx.latestAt, now)}`;
    }
    if (run >= 4) {
      return `You’ve carried the last stretch · ${shortAgo(ctx.latestAt, now)}`;
    }
    if (run === 3) {
      return `3 sends, no reply yet · ${shortAgo(ctx.latestAt, now)}`;
    }
    if (run === 2) {
      return `2 sends, waiting on them · ${shortAgo(ctx.latestAt, now)}`;
    }
    return `${youVerb} · ${shortAgo(ctx.latestAt, now)}`;
  }

  const obT = ctx.outboundText ?? ctx.outbound;
  const inT = (ctx.inboundText ?? ctx.inbound) + (ctx.inboundNoteCredit ?? 0);
  if (inT > 0 && obT > 0 && inT > Math.ceil(obT * 1.25)) {
    return "They’ve been chattier lately";
  }
  if (obT > 0 && inT > 0 && obT > Math.ceil(inT * 1.25)) {
    return "You’ve sent more lately · tap";
  }

  if (isCadenceOverdue(ctx, now)) return "Past your check-in pace · tap";

  return score >= 62 ? "Looks steady · tap" : "Tap for the read";
}

/** Brief popover — book blurb, not a manual. */
export function momentumPopoverLines(name: string, score: number, ctx: MomentumContext | undefined, now = new Date()): string[] {
  const first = (name.split(/\s+/)[0] || name).replace(/,$/, "");

  if (!ctx || ctx.total === 0) {
    return [
      `Log something for ${first} under Texts — then this number tracks timing and how the thread reads from what you saved.`,
    ];
  }

  const overdue = isCadenceOverdue(ctx, now);
  const goal = ctx.remindAfterDays;
  const theyLast = ctx.latestDirection === "inbound";
  const youLast = ctx.latestDirection === "outbound";
  const shortClose = theyLast && isVeryShortInboundBody(ctx.lastInboundPreview);

  if (shortClose) {
    return [
      `${score}/100 — ${first} ended on a very small line (a beat, not a chapter).`,
      overdue
        ? `You’re past the ~${goal}-day rhythm you set on Style — when you want back in, a real text fixes that.`
        : `You’re not failing the pace you chose; the only real question is whether you want a soft closing note or to let it breathe.`,
    ];
  }

  if (theyLast && ctx.latestAt) {
    return [
      `${score}/100 — they texted last ${shortAgo(ctx.latestAt, now)}.`,
      overdue
        ? `You’re past the ~${goal}-day check-in you set on Style — reply when you mean it.`
        : `No clock drama yet — answer when you actually want to.`,
    ];
  }

  if (youLast && ctx.lastOutboundAt) {
    const run = ctx.outboundRunSinceTheirText ?? 0;
    const rCount = ctx.inboundReactionCount ?? 0;
    const chaseCtx = tapbackChaseFromContext(ctx);
    const ibt = ctx.inboundText ?? 0;
    const ob = ctx.outboundText ?? 0;
    const topic = lastOutboundTopicSnippet(ctx.lastOutboundPreview);
    const noteHint = ctx.latestOutboundNotePreview?.trim();
    const cadenceNote = ctx.cadenceFromNote === true;
    const lines: string[] = [
      cadenceNote
        ? `${score}/100 — your last log reads like real-life context (${shortAgo(ctx.lastOutboundAt, now)}), which matters for the check-in pace you set under Style.`
        : `${score}/100 — you texted last ${shortAgo(ctx.lastOutboundAt, now)}.`,
    ];
    if (noteHint && ctx.noteCount && ctx.noteCount > 0) {
      const clip = noteHint.length > 140 ? `${noteHint.slice(0, 137)}…` : noteHint;
      lines.push(`You noted: “${clip}”`);
    }

    if (chaseCtx) {
      lines.push(
        `They’ve been answering with text reacts, not real messages — you’re doing most of the work. The number comes out lower because reciprocity looks thin.`
      );
    } else if (run === 2) {
      lines.push(
        topic != null
          ? `Since their last real line, you’ve sent 2 on your side; your last touches ${topic}. They haven’t written back yet — that’s what pulls this down, not that you texted twice.`
          : `Since their last real line, you’ve sent 2 with no written answer yet — that silence is what pulls this down, not “texting too much.”`
      );
    } else if (run >= 3) {
      lines.push(
        topic != null
          ? `You’ve sent ${run} since their last real line; your last touches ${topic}. Still no written answer — that one-sided stretch is why this reads lower.`
          : `You’ve sent ${run} since their last real line with no written answer — one-sided stretches read lower here.`
      );
    }

    if (!chaseCtx && ibt === 0 && rCount >= 1 && ob >= 2) {
      lines.push(
        rCount === 1
          ? "They only sent a text react — no written reply yet."
          : `${rCount} text reacts, no real line back yet — light engagement on paper.`
      );
    } else if (!chaseCtx && rCount >= 1 && run >= 3 && ibt > 0) {
      lines.push(
        "Mostly your words lately; they’ve used text reacts more than new sentences — that imbalance shows up here."
      );
    } else if (ob > ibt * 2 && ibt > 0 && run < 2) {
      lines.push(
        "You’ve out-sent them in the log overall — that balance shows up as a small dip, not a judgment on how much you text."
      );
    }

    return lines;
  }

  const noteHint = ctx.latestOutboundNotePreview?.trim();
  if (ctx.noteCount && ctx.noteCount > 0 && noteHint) {
    const clip = noteHint.length > 120 ? `${noteHint.slice(0, 117)}…` : noteHint;
    return [
      `${score}/100 — your thread is mostly in notes right now.`,
      `Latest: “${clip}”`,
      overdue
        ? `You’re past the ~${goal}-day window you set under Style — a newer log line may reset how that reads.`
        : `If you just logged a call, date, or meetup, timing vs Style should look kinder.`,
    ];
  }

  return [
    `${score}/100 — enough in the log to read the thread.`,
    overdue
      ? `You’re past the ~${goal}-day window you picked on Style.`
      : `If this feels off, a bubble might be on the wrong side in Texts.`,
  ];
}
