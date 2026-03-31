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
    return "They left a crumb, not a paragraph · tap";
  }

  if (ctx.latestDirection === "inbound" && ctx.latestAt) {
    return `Ball’s in your court · they pinged ${shortAgo(ctx.latestAt, now)}`;
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
    return "They’ve been louder than you lately · tap";
  }
  if (obT > 0 && inT > 0 && obT > Math.ceil(inT * 1.25)) {
    return "You’ve been the chatty one · tap";
  }

  if (isCadenceOverdue(ctx, now)) return "You’re past the check-in you picked · tap";

  return score >= 62 ? "Pretty balanced · tap" : "Tap — I’ll explain the number";
}

/** Brief popover — book blurb, not a manual. */
export function momentumPopoverLines(name: string, score: number, ctx: MomentumContext | undefined, now = new Date()): string[] {
  const first = (name.split(/\s+/)[0] || name).replace(/,$/, "");

  if (!ctx || ctx.total === 0) {
    return [
      `Drop something in Texts for ${first} — then this score actually means something instead of guessing.`,
    ];
  }

  const overdue = isCadenceOverdue(ctx, now);
  const goal = ctx.remindAfterDays;
  const theyLast = ctx.latestDirection === "inbound";
  const youLast = ctx.latestDirection === "outbound";
  const shortClose = theyLast && isVeryShortInboundBody(ctx.lastInboundPreview);

  if (shortClose) {
    return [
      `${score}/100 — ${first} left you a tiny line (like “k” or “lol”), not a real turn.`,
      overdue
        ? `You’re past the ~${goal}-day rhythm you chose. If you still care, say something real; if not, you’re allowed to let it die.`
        : `No shame either way: either send one clean line or let the thread go quiet on purpose.`,
    ];
  }

  if (theyLast && ctx.latestAt) {
    return [
      `${score}/100 — ${first} texted last (${shortAgo(ctx.latestAt, now)}).`,
      overdue
        ? `You told Rhythm ~${goal} days for this tier — you’re past that. Reply when you mean it, or log what you already sent outside the app.`
        : `You’re not “late” yet by your own rules. Answer when you want to, not because the app guilted you.`,
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
        ? `${score}/100 — your last save looks like real life (${shortAgo(ctx.lastOutboundAt, now)}), so Rhythm counts it for your check-in pace.`
        : `${score}/100 — you texted last ${shortAgo(ctx.lastOutboundAt, now)}.`,
    ];
    if (noteHint && ctx.noteCount && ctx.noteCount > 0) {
      const clip = noteHint.length > 140 ? `${noteHint.slice(0, 137)}…` : noteHint;
      lines.push(`You wrote in notes: “${clip}”`);
    }

    if (chaseCtx) {
      lines.push(
        `They’re answering with taps and reacts, not sentences. You’re doing the emotional labor — the score nudges down because it looks one-sided on paper.`
      );
      lines.push(
        `Chill until they type actual words, or send one short line that needs a real answer — then hands off your phone.`
      );
    } else if (run === 2) {
      lines.push(
        topic != null
          ? `After their last real text you sent twice; your last one was about ${topic}. Still no written answer — that quiet is what drags the number, not “double texting.”`
          : `After their last real text you sent twice and got silence. That’s not “you texted too much” — it’s you waiting on someone who hasn’t shown up in writing.`
      );
      lines.push(`Wait, or send one fresh angle and then stop until they answer like a grown-up.`);
    } else if (run >= 3) {
      lines.push(
        topic != null
          ? `${run} texts from you since their last real line; last touch was ${topic}. Still nothing back — yeah, the score is going to look rough.`
          : `${run} texts from you since their last real line. At this point you’re carrying the whole conversation.`
      );
      lines.push(`Back up. Let them walk across the gap — unless one last message is honestly worth it, then log it and stop.`);
    }

    if (!chaseCtx && ibt === 0 && rCount >= 1 && ob >= 2) {
      lines.push(
        rCount === 1
          ? "They fired a react — not a reply."
          : `${rCount} reacts, still no real message. Cute on iMessage, rough on your score.`
      );
    } else if (!chaseCtx && rCount >= 1 && run >= 3 && ibt > 0) {
      lines.push("Mostly you talking; they’re on react duty. That shows up here.");
    } else if (ob > ibt * 2 && ibt > 0 && run < 2) {
      lines.push("Overall you’ve typed more than them in what you saved — small ding, not a character judgment.");
    }

    return lines;
  }

  const noteHint = ctx.latestOutboundNotePreview?.trim();
  if (ctx.noteCount && ctx.noteCount > 0 && noteHint) {
    const clip = noteHint.length > 120 ? `${noteHint.slice(0, 117)}…` : noteHint;
    return [
      `${score}/100 — this thread is basically living in your notes.`,
      `Latest note: “${clip}”`,
      overdue
        ? `You’re past the ~${goal}-day window you picked — log a fresh touch when you actually reach out.`
        : `If that note was a date or call, timing should look kinder once it’s reflected in Texts.`,
    ];
  }

  return [
    `${score}/100 — enough logged to judge the vibe.`,
    overdue
      ? `You’re past the ~${goal}-day check-in you set for yourself.`
      : `If this feels wrong, flip a bubble to the right side in Texts — the score only knows what you logged.`,
  ];
}
