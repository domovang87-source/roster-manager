import type { MomentumContext } from "./momentum-insight";

export type PortfolioProspect = {
  id: string;
  name: string;
  tier: "A" | "B" | "C";
  momentum?: number;
  momentumContext?: MomentumContext;
};

export function flattenTierProspects(
  tierProspects: Record<"A" | "B" | "C", PortfolioProspect[]>
): PortfolioProspect[] {
  return [...tierProspects.A, ...tierProspects.B, ...tierProspects.C];
}

/** Average momentum across entire roster (zeros for people with no logged activity). */
export function averagePortfolioMomentum(prospects: PortfolioProspect[]): number {
  if (prospects.length === 0) return 0;
  const sum = prospects.reduce((s, p) => s + (p.momentum ?? 0), 0);
  return Math.round((sum / prospects.length) * 10) / 10;
}

function daysBetween(iso: string, now: Date): number {
  const ms = now.getTime() - new Date(iso).getTime();
  if (ms < 0) return 0;
  return ms / 86_400_000;
}

/**
 * A-tier: they sent the latest meaningful ping and you haven’t outbound-replied after them in several days.
 */
export function isAtGhostingRisk(p: PortfolioProspect, now = new Date()): boolean {
  if (p.tier !== "A") return false;
  const ctx = p.momentumContext;
  if (!ctx || ctx.total === 0) return false;
  const tIn = ctx.lastInboundAt ? new Date(ctx.lastInboundAt).getTime() : null;
  const tOut = ctx.lastOutboundAt ? new Date(ctx.lastOutboundAt).getTime() : null;
  const theyNewer = tIn !== null && (tOut === null || tIn > tOut);
  if (!theyNewer) return false;
  const d = ctx.lastInboundAt ? daysBetween(ctx.lastInboundAt, now) : 0;
  const threshold = Math.max(3, Math.min(10, (ctx.remindAfterDays ?? 3) * 1.2));
  return d >= threshold;
}

/** B-tier with meaningful lift vs last snapshot, or strong current momentum. */
export function isTrendingUp(
  p: PortfolioProspect,
  prevMomentumById: Record<string, number>,
  now = new Date()
): boolean {
  if (p.tier !== "B") return false;
  const cur = p.momentum ?? 0;
  const prev = prevMomentumById[p.id];
  if (prev !== undefined && cur >= prev + 10) return true;
  if (prev !== undefined && prev > 0 && (cur - prev) / prev >= 0.12) return true;
  if (cur >= 62 && (p.momentumContext?.total ?? 0) >= 4) return true;
  return false;
}

export type PortfolioAuditCopy = {
  avgMomentum: number;
  prospectCount: number;
  weekOverWeekPct: number | null;
  aTierAtRisk: number;
  bTierTrending: number;
};

export function buildPortfolioAudit(
  prospects: PortfolioProspect[],
  prevWeekAvg: number | null,
  prevMomentumById: Record<string, number>,
  now = new Date()
): PortfolioAuditCopy {
  const avgMomentum = averagePortfolioMomentum(prospects);
  const weekOverWeekPct =
    prevWeekAvg !== null && prevWeekAvg > 0.01
      ? Math.round(((avgMomentum - prevWeekAvg) / prevWeekAvg) * 1000) / 10
      : null;
  const flat = prospects;
  let aTierAtRisk = 0;
  let bTierTrending = 0;
  for (const p of flat) {
    if (isAtGhostingRisk(p, now)) aTierAtRisk += 1;
    if (isTrendingUp(p, prevMomentumById, now)) bTierTrending += 1;
  }
  return {
    avgMomentum,
    prospectCount: prospects.length,
    weekOverWeekPct,
    aTierAtRisk,
    bTierTrending,
  };
}

export type SocialEquityRow = {
  id: string;
  name: string;
  tier: "A" | "B" | "C";
  inbound: number;
  outbound: number;
  /** Share of logged thread rows that are outbound, 0–100 */
  outboundPct: number;
  /** Their-side read from logged line mix — not a personality label. */
  styleLabel: string;
  /** C-tier with more 7d touches than your busiest A (requires ≥1 A on roster) */
  energyLeak: boolean;
};

/**
 * Social Equity tag: how **they** show up in what you logged (inbound vs outbound lines).
 * Sparse on their side → thin returns; heavy on their side → they’re driving the visible thread.
 */
export function communicationStyleFromContext(
  ctx: MomentumContext | undefined,
  _momentum: number | undefined
): string {
  if (!ctx || ctx.total === 0) return "No read";

  const ib = ctx.inboundText ?? ctx.inbound;
  const ob = ctx.outboundText ?? ctx.outbound;
  const lines = ib + ob;
  if (lines < 4) return "No read";

  const outShare = ob / lines;
  if (outShare >= 0.58) return "The Minimum";
  if (outShare <= 0.42) return "The Driver";
  return "The Volley";
}

export function computeEnergyLeakFlag(
  tier: "A" | "B" | "C",
  count7d: number,
  maxA7d: number,
  hasATier: boolean
): boolean {
  return tier === "C" && hasATier && count7d > maxA7d;
}

export function buildSocialEquityRows(
  prospects: PortfolioProspect[],
  count7dByProspect: Map<string, number>,
  maxA7d: number,
  hasATier: boolean
): SocialEquityRow[] {
  return prospects.map((p) => {
    const ctx = p.momentumContext;
    const ib = ctx ? (ctx.inboundText ?? ctx.inbound) : 0;
    const ob = ctx ? (ctx.outboundText ?? ctx.outbound) : 0;
    const sum = ib + ob;
    const count7d = count7dByProspect.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      tier: p.tier,
      inbound: ib,
      outbound: ob,
      outboundPct: sum === 0 ? 0 : Math.round((ob / sum) * 100),
      styleLabel: communicationStyleFromContext(ctx, p.momentum),
      energyLeak: computeEnergyLeakFlag(p.tier, count7d, maxA7d, hasATier),
    };
  });
}
