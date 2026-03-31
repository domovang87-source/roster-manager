import type { PortfolioProspect } from "./portfolio-stats";
import { isAtGhostingRisk } from "./portfolio-stats";

/** Shown when user expands Active Charisma help on Pulse — plain talk, not a manual. */
export const SOCIAL_SCORE_EXPLAINER =
  "Active Charisma (0–100) is blunt: do your real texts match how you ranked people (A/B/C), the check-in pace you picked in Rhythm, and what you actually log? It’s not a moral grade — it’s whether your behavior matches your own rules.";

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
    return `Score’s ${x}/100 on paper — add people under People when you’re ready to mean it.`;
  }

  if (activityCount === 0) {
    return `Score’s ${x}/100 but you haven’t logged a thread yet. Screenshot or quick log — otherwise we’re guessing.`;
  }

  const aListGhost = prospects.filter((p) => p.tier === "A" && isAtGhostingRisk(p, now));
  if (aListGhost.length > 0) {
    const n = firstName(aListGhost[0].name);
    return `${x}/100 partly because ${n} is A-list, they texted last, and you’ve got nothing logged back. Either reply or log what you already sent — you said they were top tier.`;
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
    return `${x}/100 because you told Rhythm ~every ${goal} day${goal === 1 ? "" : "s"} for that tier, and ${n} (and maybe others) doesn’t match what you logged. Touch base or log what you did.`;
  }

  if (avg < 45) {
    return `${x}/100 — a bunch of threads look dusty vs how you ranked people. Small replies + honest logging are the fastest fix.`;
  }

  if (avg >= 68) {
    return `${x}/100 — you’re mostly walking the walk for how you sorted your roster. Keep Texts honest so it stays true.`;
  }

  return `${x}/100 — mixed bag. Some chats match your priorities; others need a nudge. Put energy where you ranked it.`;
}
