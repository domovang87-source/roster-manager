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
  if (!ctx || ctx.total === 0) return "Tap for the story";

  if (ctx.latestDirection === "inbound" && isVeryShortInboundBody(ctx.lastInboundPreview)) {
    return "They dropped a crumb — low cost on their side · tap";
  }

  if (ctx.latestDirection === "inbound" && ctx.latestAt) {
    return `Leverage shifted · they pinged ${shortAgo(ctx.latestAt, now)}`;
  }

  if (ctx.latestDirection === "outbound" && ctx.latestAt) {
    const run = ctx.outboundRunSinceTheirText ?? 0;
    const ibt = ctx.inboundText ?? ctx.inbound;
    const r = ctx.inboundReactionCount ?? 0;
    const youVerb = ctx.cadenceFromNote ? "You logged last" : "You texted last";
    if (tapbackChaseFromContext(ctx)) {
      return `You’re writing essays; they’re only tapping reacts · ${shortAgo(ctx.latestAt, now)}`;
    }
    if (ibt === 0 && r >= 1 && (ctx.outboundText ?? 0) >= 2) {
      return `Heart reacts, zero sentences · ${shortAgo(ctx.latestAt, now)}`;
    }
    if (run >= 4) {
      return `${run} pings from you, still quiet from them · ${shortAgo(ctx.latestAt, now)}`;
    }
    if (run === 3) {
      return `Triple text energy, no real reply · ${shortAgo(ctx.latestAt, now)}`;
    }
    if (run === 2) {
      return `You doubled up — now wait · ${shortAgo(ctx.latestAt, now)}`;
    }
    return `${youVerb} · ${shortAgo(ctx.latestAt, now)}`;
  }

  const obT = ctx.outboundText ?? ctx.outbound;
  const inT = (ctx.inboundText ?? ctx.inbound) + (ctx.inboundNoteCredit ?? 0);
  if (inT > 0 && obT > 0 && inT > Math.ceil(obT * 1.25)) {
    return "Their side’s been heavy in the log · tap";
  }
  if (obT > 0 && inT > 0 && obT > Math.ceil(inT * 1.25)) {
    return "You’re out-voicing them in what you saved · tap";
  }

  if (isCadenceOverdue(ctx, now)) return "Past the rhythm you set — your move or own the silence · tap";

  return score >= 62 ? "Ledger looks even enough · tap" : "Tap — thread read from your log";
}

/** Brief popover — book blurb, not a manual. */
export function momentumPopoverLines(name: string, score: number, ctx: MomentumContext | undefined, now = new Date()): string[] {
  const first = (name.split(/\s+/)[0] || name).replace(/,$/, "");

  if (!ctx || ctx.total === 0) {
    return [`Log Texts for ${first} — then this number is real.`];
  }

  const overdue = isCadenceOverdue(ctx, now);
  const goal = ctx.remindAfterDays;
  const theyLast = ctx.latestDirection === "inbound";
  const youLast = ctx.latestDirection === "outbound";
  const shortClose = theyLast && isVeryShortInboundBody(ctx.lastInboundPreview);

  if (shortClose) {
    return [
      `${score}/100 — ${first} left a tiny line, not a real turn.`,
      overdue
        ? `Past your ~${goal}d rhythm. Reply if you care; ghost on purpose if you don’t.`
        : `Your call: one real line or let it rest.`,
    ];
  }

  if (theyLast && ctx.latestAt) {
    return [
      `${score}/100 — ${first} texted last ${shortAgo(ctx.latestAt, now)}.`,
      overdue
        ? `Past the ~${goal}d you set. Reply or log an outside reply.`
        : `Not “late” yet by your rules.`,
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
        ? `${score}/100 — last log looks like real life (${shortAgo(ctx.lastOutboundAt, now)}); Rhythm counts it.`
        : `${score}/100 — you texted last ${shortAgo(ctx.lastOutboundAt, now)}.`,
    ];
    if (noteHint && ctx.noteCount && ctx.noteCount > 0) {
      const clip = noteHint.length > 140 ? `${noteHint.slice(0, 137)}…` : noteHint;
      lines.push(`Note: “${clip}”`);
    }

    if (chaseCtx) {
      lines.push(
        `Reacts, not sentences — you’re doing the work. Score drops because it looks one-sided. Wait for real words or one short question, then stop.`
      );
    } else if (run === 2) {
      lines.push(
        topic != null
          ? `Two texts from you since their last line (${topic}); still quiet from them — that’s the drag, not “double text.”`
          : `Two texts from you since their line; silence back — that’s the drag.`
      );
      lines.push(`Wait, or one new angle then hands off.`);
    } else if (run >= 3) {
      lines.push(
        topic != null
          ? `${run} from you since their line (${topic}). You’re carrying it — score reflects that.`
          : `${run} from you since their line — you’re carrying it.`
      );
      lines.push(`Back up unless one last ping is worth it.`);
    }

    if (!chaseCtx && ibt === 0 && rCount >= 1 && ob >= 2) {
      lines.push(rCount === 1 ? "React, not a reply." : `${rCount} reacts, no real line.`);
    } else if (!chaseCtx && rCount >= 1 && run >= 3 && ibt > 0) {
      lines.push("You’re typing; they’re reacting.");
    } else if (ob > ibt * 2 && ibt > 0 && run < 2) {
      lines.push("You’ve out-sent them overall — small ding.");
    }

    return lines;
  }

  const noteHint = ctx.latestOutboundNotePreview?.trim();
  if (ctx.noteCount && ctx.noteCount > 0 && noteHint) {
    const clip = noteHint.length > 120 ? `${noteHint.slice(0, 117)}…` : noteHint;
    return [
      `${score}/100 — mostly notes.`,
      `“${clip}”`,
      overdue ? `Past ~${goal}d — log when you touch base.` : `Log Texts too if it was a real meetup.`,
    ];
  }

  return [
    `${score}/100 — enough to read.`,
    overdue ? `Past ~${goal}d you set.` : `Wrong? Fix bubble sides in Texts.`,
  ];
}
