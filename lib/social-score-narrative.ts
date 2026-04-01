import type { PortfolioProspect } from "./portfolio-stats";
import { isAtGhostingRisk } from "./portfolio-stats";

/** Shown when user expands Active Charisma on Pulse — keep short; line below is the real take. */
export const SOCIAL_SCORE_EXPLAINER =
  "0–100: does the ledger match who you said matters (A/B/C) and the rhythm you chose? Not a grade — a power read on your own data.";

function firstName(full: string): string {
  return (full.split(/\s+/)[0] || full).replace(/,$/, "");
}

function daysSinceLastOutboundMs(ctx: PortfolioProspect["momentumContext"], now: Date): number | null {
  if (!ctx?.lastOutboundAt) return null;
  return (now.getTime() - new Date(ctx.lastOutboundAt).getTime()) / 86_400_000;
}

function isBehindOwnCheckInGoal(p: PortfolioProspect, now: Date): boolean {
  const ctx = p.momentumContext;
  if (!ctx || ctx.total === 0) return false;
  const goalDays = Math.max(1, Math.min(90, ctx.remindAfterDays ?? 7));
  const d = daysSinceLastOutboundMs(ctx, now);
  if (d === null) {
    const tIn = ctx.lastInboundAt ? new Date(ctx.lastInboundAt).getTime() : 0;
    const tOut = ctx.lastOutboundAt ? new Date(ctx.lastOutboundAt).getTime() : 0;
    const theyReachedOut = tIn > 0 && (!ctx.lastOutboundAt || tIn > tOut);
    return theyReachedOut || ctx.outbound === 0;
  }
  return d > goalDays * 1.05;
}

/**
 * Plain-English synopsis under the explainer — uses roster + logs, no API.
 */
export function buildSocialScoreSynopsis(
  avg: number,
  prospects: PortfolioProspect[],
  activityCount: number,
  now = new Date()
): string {
  const x = Math.round(avg * 10) / 10;

  if (prospects.length === 0) {
    return `${x}/100 — add People when you’re serious.`;
  }

  if (activityCount === 0) {
    return `${x}/100 — log Texts or we’re guessing.`;
  }

  const aListGhost = prospects.filter((p) => p.tier === "A" && isAtGhostingRisk(p, now));
  if (aListGhost.length > 0) {
    const n = firstName(aListGhost[0].name);
    return `${x}/100 — ${n} is A-tier, they texted last, you’ve got no reply logged. Fix it or log what you sent elsewhere.`;
  }

  const behind = prospects
    .filter((p) => isBehindOwnCheckInGoal(p, now))
    .sort((a, b) => {
      const o = (t: PortfolioProspect["tier"]) => (t === "A" ? 0 : t === "B" ? 1 : 2);
      return o(a.tier) - o(b.tier);
    });

  if (avg < 55 && behind.length > 0) {
    const p0 = behind[0];
    const n = firstName(p0.name);
    const goal = p0.momentumContext?.remindAfterDays ?? 7;
    return `${x}/100 — you set ~${goal}d check-ins; ${n} (and maybe more) doesn’t match the log. Ping or log it.`;
  }

  if (avg < 45) {
    return `${x}/100 — cold threads vs who you ranked up. Reply or log what you already sent off-app.`;
  }

  if (avg >= 68) {
    return `${x}/100 — allocation mostly matches intent. Keep the log honest.`;
  }

  return `${x}/100 — mixed picture. Tilt effort toward A before you feed C.`;
}
