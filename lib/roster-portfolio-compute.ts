import type { MomentumContext } from "./momentum-insight";
import type { PortfolioProspect } from "./portfolio-stats";
import { DEFAULT_REMIND_DAYS_BY_TIER, normalizeRemindDays, type RulesTier } from "./momentum-check-in";
import {
  clampNoteEngagementCredit,
  noteCountsForStyleCadence,
  theirEngagementCreditFromNoteBody,
} from "./note-engagement-signal";
import { computeThreadMomentum100, type ThreadTrailSignals } from "./thread-momentum-score";

export type Tier = "A" | "B" | "C";

export function coerceTier(value: unknown, fallback: Tier = "B"): Tier {
  return value === "A" || value === "B" || value === "C" ? value : fallback;
}

export type ThreadAgg = {
  inbound: number;
  outbound: number;
  /** Inbound rows excluding text-react lines — balance + chattiness heuristics. */
  inboundText: number;
  /** Virtual inbound weight from notes (voice memo, calls) — balance only, capped. */
  inboundNoteCredit: number;
  /** Outbound rows that are not private notes or reactions — balance + “who texted last”. */
  outboundText: number;
  noteCount: number;
  touchBaseCount: number;
  total: number;
};

/** Inbound lines that are text reacts / Screen Time–style imports (not a written reply). */
export function isReactionMessageBody(body: string): boolean {
  const t = body.trim().toLowerCase();
  if (t.length === 0) return false;
  if (t.startsWith("reacted ")) return true;
  if (t.startsWith("liked ")) return true;
  if (t.startsWith("loved ")) return true;
  if (t.startsWith("laughed at ") || t.startsWith("laughed ")) return true;
  if (t.startsWith("emphasized ")) return true;
  if (t.startsWith("questioned ")) return true;
  if (t.startsWith("disliked ")) return true;
  if (t.startsWith("liked an image") || t.startsWith("loved an image")) return true;
  if (/^(heart|thumbs up|thumbs down|ha ha|exclamation|question mark)\b/.test(t)) return true;
  return false;
}

function isoMs(iso: string): number {
  return new Date(iso).getTime();
}

/** Consecutive outbound texts since their last substantive inbound; text reacts scoped to your current streak. */
export function computeThreadTrailSignals(rows: MessageRowLike[]): ThreadTrailSignals {
  let inboundReactionCount = 0;
  for (const row of rows) {
    if (String(row.direction ?? "").toLowerCase() !== "inbound") continue;
    if (isReactionMessageBody(String(row.body ?? ""))) inboundReactionCount += 1;
  }
  const sorted = [...rows].sort((a, b) => isoMs(b.created_at) - isoMs(a.created_at));
  let i = 0;
  let leadingInboundReactions = 0;
  while (i < sorted.length) {
    const row = sorted[i];
    const isNote = row.event_type === "note";
    const bodyStr = String(row.body ?? "");
    const isReaction = isReactionMessageBody(bodyStr);
    const isInbound = String(row.direction ?? "").toLowerCase() === "inbound";
    if (isNote) {
      i += 1;
      continue;
    }
    if (isInbound && isReaction) {
      leadingInboundReactions += 1;
      i += 1;
      continue;
    }
    break;
  }
  let outboundRunSinceTheirText = 0;
  let sandwichedInboundReactions = 0;
  while (i < sorted.length) {
    const row = sorted[i];
    const isNote = row.event_type === "note";
    const bodyStr = String(row.body ?? "");
    const isReaction = isReactionMessageBody(bodyStr);
    const isInbound = String(row.direction ?? "").toLowerCase() === "inbound";
    if (isNote) {
      i += 1;
      continue;
    }
    if (isInbound && isReaction) {
      if (outboundRunSinceTheirText > 0) sandwichedInboundReactions += 1;
      i += 1;
      continue;
    }
    if (isInbound && !isReaction) break;
    if (!isInbound && !isReaction) {
      outboundRunSinceTheirText += 1;
      i += 1;
      continue;
    }
    i += 1;
  }
  const tapbacksDuringYourStreak = leadingInboundReactions + sandwichedInboundReactions;
  return { inboundReactionCount, outboundRunSinceTheirText, tapbacksDuringYourStreak };
}

const RECENT_TEXT_BODY_LIMIT = 5;

/** Newest-first substantive text bubbles per prospect — for charisma context heuristics. */
export function collectRecentTextBodiesForProspect(
  rows: MessageRowLike[],
  prospectId: string,
  limit = RECENT_TEXT_BODY_LIMIT
): { inbound: string[]; outbound: string[] } {
  const mine = rows.filter((r) => String(r.prospect_id) === prospectId);
  const inboundSorted = mine
    .filter((r) => String(r.direction ?? "").toLowerCase() === "inbound")
    .sort((a, b) => isoMs(b.created_at) - isoMs(a.created_at));
  const outboundSorted = mine
    .filter((r) => String(r.direction ?? "").toLowerCase() === "outbound")
    .sort((a, b) => isoMs(b.created_at) - isoMs(a.created_at));
  const inbound: string[] = [];
  for (const row of inboundSorted) {
    const bodyStr = String(row.body ?? "");
    if (isReactionMessageBody(bodyStr)) continue;
    if (bodyStr.trim().length < 2) continue;
    inbound.push(bodyStr);
    if (inbound.length >= limit) break;
  }
  const outbound: string[] = [];
  for (const row of outboundSorted) {
    if (row.event_type === "note") continue;
    const bodyStr = String(row.body ?? "");
    if (isReactionMessageBody(bodyStr)) continue;
    if (bodyStr.trim().length < 2) continue;
    outbound.push(bodyStr);
    if (outbound.length >= limit) break;
  }
  return { inbound, outbound };
}

export type MomentumComputeOpts = {
  lastOutboundAt?: string;
  remindAfterDays: number;
  now: Date;
  latestDirection?: "inbound" | "outbound";
  lastInboundPreview?: string;
  /** Text-react count + outbound streak since their last real line — feeds score + copy. */
  trailSignals?: ThreadTrailSignals;
  /** Prospect People notes — relaxes imbalance / open-loop penalties when you said friend, work, etc. */
  vibeNotes?: string;
  /** Newest-first logged inbound text bodies (non-reacts) for repair/affection heuristics. */
  recentInboundTextBodies?: string[];
  /** Newest-first logged outbound text bodies for conflict heuristics. */
  recentOutboundTextBodies?: string[];
};

/** 0–100: neutral baseline 80; penalties/bonuses in `computeThreadMomentum100` (incl. “you texted last” open-loop). */
export function computeThreadMomentum(a: ThreadAgg, tier: Tier, opts: MomentumComputeOpts): number {
  if (a.total === 0) return 0;
  return computeThreadMomentum100(
    tier,
    a.total,
    a.inboundText,
    a.inboundNoteCredit,
    a.outboundText,
    a.noteCount,
    a.touchBaseCount,
    opts.lastOutboundAt,
    opts.remindAfterDays,
    opts.now,
    opts.latestDirection,
    opts.lastInboundPreview,
    opts.trailSignals,
    {
      vibeNotes: opts.vibeNotes,
      recentInboundTextBodies: opts.recentInboundTextBodies,
      recentOutboundTextBodies: opts.recentOutboundTextBodies,
    }
  );
}

export type ProspectRowLike = {
  id: string;
  name?: string | null;
  tier?: unknown;
  phone_number?: string | null;
  vibe_notes?: string | null;
};

export type MessageRowLike = {
  body?: string | null;
  created_at: string;
  direction: string;
  prospect_id: string;
  event_type?: string | null;
};

export type RosterProspectMomentumState = {
  momentum: number;
  momentumContext?: MomentumContext;
  lastInboundBody?: string;
  /** Body of the most recent outbound text (non-note, non-reaction), for honest stack context when you texted last. */
  lastOutboundTextBody?: string;
  lastActivityAt?: string;
};

/**
 * Aggregates messages and returns per-prospect momentum (matches Home `loadTierProspects` math).
 */
export function buildProspectMomentumStateMap(
  prospectRows: ProspectRowLike[],
  messageRows: MessageRowLike[],
  remindByTier: Record<Tier, number>,
  now: Date
): Map<string, RosterProspectMomentumState> {
  const latestActivityAt = new Map<string, string>();
  const latestInbound = new Map<string, { body: string; at: string }>();
  const threadAgg = new Map<string, ThreadAgg>();
  const bumpAgg = (pid: string) => {
    if (!threadAgg.has(pid)) {
      threadAgg.set(pid, {
        inbound: 0,
        outbound: 0,
        inboundText: 0,
        inboundNoteCredit: 0,
        outboundText: 0,
        noteCount: 0,
        touchBaseCount: 0,
        total: 0,
      });
    }
    return threadAgg.get(pid)!;
  };

  const latestOutboundText = new Map<string, { body: string; at: string }>();
  /** Latest outbound row (text or note, not reaction) — drives “who logged last” for momentum copy. */
  const latestOutboundAny = new Map<string, { body: string; at: string }>();
  /** Latest outbound note body — surfaced in popover when notes carry the story. */
  const latestOutboundNote = new Map<string, { body: string; at: string }>();
  /** Best timestamp for Style cadence: all outbound texts + notes that describe real-world touch. */
  const cadenceAnchor = new Map<string, { at: string; body: string; fromNote: boolean }>();
  const rowsByProspect = new Map<string, MessageRowLike[]>();

  for (const row of messageRows) {
    const pid = row.prospect_id as string;
    const at = row.created_at as string;
    if (!rowsByProspect.has(pid)) rowsByProspect.set(pid, []);
    rowsByProspect.get(pid)!.push(row);
    const agg = bumpAgg(pid);
    const isNote = row.event_type === "note";
    const bodyStr = String(row.body ?? "");
    const isReaction = isReactionMessageBody(bodyStr);
    const isInbound = String(row.direction ?? "").toLowerCase() === "inbound";
    agg.total += 1;
    if (isInbound) {
      agg.inbound += 1;
      if (!isReaction) agg.inboundText += 1;
    } else {
      agg.outbound += 1;
      if (!isNote && !isReaction) agg.outboundText += 1;
    }
    if (isNote) {
      agg.noteCount += 1;
      const add = theirEngagementCreditFromNoteBody(bodyStr);
      if (add > 0) {
        agg.inboundNoteCredit = clampNoteEngagementCredit(agg.inboundNoteCredit + add);
      }
    }
    if (!isInbound && !isReaction) {
      const prevAny = latestOutboundAny.get(pid);
      if (!prevAny || isoMs(at) > isoMs(prevAny.at)) {
        latestOutboundAny.set(pid, { body: bodyStr, at });
      }
      if (isNote) {
        const prevN = latestOutboundNote.get(pid);
        if (!prevN || isoMs(at) > isoMs(prevN.at)) {
          latestOutboundNote.set(pid, { body: bodyStr, at });
        }
      }
      if (!isNote) {
        const prevC = cadenceAnchor.get(pid);
        if (!prevC || isoMs(at) > isoMs(prevC.at)) {
          cadenceAnchor.set(pid, { at, body: bodyStr, fromNote: false });
        }
      } else if (noteCountsForStyleCadence(bodyStr)) {
        const prevC = cadenceAnchor.get(pid);
        if (!prevC || isoMs(at) > isoMs(prevC.at)) {
          cadenceAnchor.set(pid, { at, body: bodyStr, fromNote: true });
        }
      }
    }
    if (!isInbound && (bodyStr.includes("Touched base") || (isNote && noteCountsForStyleCadence(bodyStr)))) {
      agg.touchBaseCount += 1;
    }
    if (!latestActivityAt.has(pid)) {
      latestActivityAt.set(pid, at);
    }
    if (isInbound && !isReaction) {
      const prev = latestInbound.get(pid);
      if (!prev || isoMs(at) > isoMs(prev.at)) {
        latestInbound.set(pid, { body: bodyStr, at });
      }
    }
    if (!isInbound && !isNote && !isReaction) {
      const prev = latestOutboundText.get(pid);
      if (!prev || isoMs(at) > isoMs(prev.at)) {
        latestOutboundText.set(pid, { body: bodyStr, at });
      }
    }
  }

  const out = new Map<string, RosterProspectMomentumState>();
  for (const row of prospectRows) {
    const tier = coerceTier(row.tier);
    const pid = String(row.id);
    const inbound = latestInbound.get(pid);
    const agg = threadAgg.get(pid);
    const remindDays = remindByTier[tier];
    const lastOut = latestOutboundText.get(pid);
    const lastTextOut = lastOut?.at;
    const anyOut = latestOutboundAny.get(pid);
    const anyOutAt = anyOut?.at;
    const cadence = cadenceAnchor.get(pid);
    const cadenceAt = cadence?.at;
    const noteLast = latestOutboundNote.get(pid);
    const tIn = inbound?.at;
    let latestDirection: "inbound" | "outbound" | undefined;
    let latestAt: string | undefined;
    if (tIn && anyOutAt) {
      const msIn = isoMs(tIn);
      const msOut = isoMs(anyOutAt);
      if (msIn > msOut) {
        latestDirection = "inbound";
        latestAt = tIn;
      } else if (msOut > msIn) {
        latestDirection = "outbound";
        latestAt = anyOutAt;
      } else {
        latestDirection = "inbound";
        latestAt = tIn;
      }
    } else if (tIn) {
      latestDirection = "inbound";
      latestAt = tIn;
    } else if (anyOutAt) {
      latestDirection = "outbound";
      latestAt = anyOutAt;
    }
    const trailRows = rowsByProspect.get(pid) ?? [];
    const trailSignals = computeThreadTrailSignals(trailRows);
    const { inbound: recentIn, outbound: recentOut } = collectRecentTextBodiesForProspect(
      messageRows,
      pid,
      RECENT_TEXT_BODY_LIMIT
    );
    const momentumContext: MomentumContext | undefined = agg
      ? {
          tier,
          remindAfterDays: remindDays,
          inbound: agg.inbound,
          outbound: agg.outbound,
          inboundText: agg.inboundText,
          inboundNoteCredit: agg.inboundNoteCredit,
          outboundText: agg.outboundText,
          total: agg.total,
          noteCount: agg.noteCount,
          touchBaseCount: agg.touchBaseCount,
          lastInboundAt: inbound?.at,
          lastOutboundAt: cadenceAt ?? lastTextOut,
          lastInboundPreview: inbound?.body,
          lastOutboundPreview: cadence?.body ?? lastOut?.body,
          latestDirection,
          latestAt,
          latestOutboundNotePreview: noteLast?.body,
          cadenceFromNote: cadence?.fromNote === true,
          inboundReactionCount: trailSignals.inboundReactionCount,
          outboundRunSinceTheirText: trailSignals.outboundRunSinceTheirText,
          tapbacksDuringYourStreak: trailSignals.tapbacksDuringYourStreak,
        }
      : undefined;
    const momentum = agg
      ? computeThreadMomentum(agg, tier, {
          lastOutboundAt: cadenceAt ?? lastTextOut,
          remindAfterDays: remindDays,
          now,
          latestDirection,
          lastInboundPreview: inbound?.body,
          trailSignals,
          vibeNotes: row.vibe_notes ?? undefined,
          recentInboundTextBodies: recentIn,
          recentOutboundTextBodies: recentOut,
        })
      : 0;
    out.set(pid, {
      momentum,
      momentumContext,
      lastInboundBody: inbound?.body,
      lastOutboundTextBody: lastOut?.body,
      lastActivityAt: latestActivityAt.get(pid),
    });
  }
  return out;
}

export function remindByTierFromRulesRows(
  rows: Array<{ tier?: string | null; remind_after_days?: unknown }> | null | undefined
): Record<Tier, number> {
  const remindByTier: Record<Tier, number> = {
    A: DEFAULT_REMIND_DAYS_BY_TIER.A,
    B: DEFAULT_REMIND_DAYS_BY_TIER.B,
    C: DEFAULT_REMIND_DAYS_BY_TIER.C,
  };
  for (const row of rows ?? []) {
    const t = coerceTier(row.tier);
    remindByTier[t] = normalizeRemindDays(row.remind_after_days, DEFAULT_REMIND_DAYS_BY_TIER[t]);
  }
  return remindByTier;
}

export function buildPortfolioProspectsForAudit(
  prospectRows: ProspectRowLike[],
  messageRows: MessageRowLike[],
  remindByTier: Record<Tier, number>,
  now: Date
): PortfolioProspect[] {
  const map = buildProspectMomentumStateMap(prospectRows, messageRows, remindByTier, now);
  return prospectRows.map((row) => {
    const pid = String(row.id);
    const tier = coerceTier(row.tier);
    const st = map.get(pid);
    return {
      id: pid,
      name: row.name ?? "Unknown",
      tier,
      momentum: st?.momentum ?? 0,
      momentumContext: st?.momentumContext,
    };
  });
}
