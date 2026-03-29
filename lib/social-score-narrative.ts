import type { PortfolioProspect } from "./portfolio-stats";
import { isAtGhostingRisk } from "./portfolio-stats";

/** Shown when user expands “What is social score?” on Pulse. */
export const SOCIAL_SCORE_EXPLAINER = `You picked who is on this list and how much they matter (A = most important, C = more casual). Your social score is one number for how well you are keeping up with that choice — replying when they reach out, texting on the rhythm you set under Style, and saving what actually happened under Texts. It is not a judgment on anyone; it is whether your real behavior matches the priorities you said you wanted.`;

function firstName(full: string): string {
  return (full.split(/\s+/)[0] || full).replace(/,$/, "");
}

function daysSinceLastOutboundMs(ctx: PortfolioProspect["momentumContext"], now: Date): number | null {
  if (!ctx?.lastOutboundAt) return null;
  return (now.getTime() - new Date(ctx.lastOutboundAt).getTime()) / 86_400_000;
}

/**
 * User’s own check-in goal (Style / tier) vs last logged outbound — rough “behind schedule” flag.
 */
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
    return `Your social score is ${x} out of 100. Add people under People when you are ready to track who you are actually investing in.`;
  }

  if (activityCount === 0) {
    return `Your social score is ${x} out of 100 until you log something under Texts. Save a screenshot or a quick note so the score reflects real threads, not guesses.`;
  }

  const aListGhost = prospects.filter((p) => p.tier === "A" && isAtGhostingRisk(p, now));
  if (aListGhost.length > 0) {
    const n = firstName(aListGhost[0].name);
    return `Your social score is ${x} out of 100 in part because ${n} is someone you marked top priority and they texted you last — you have not replied in the app’s eyes. That drags your score because this list is about who you said you would prioritize. Text ${n} back, or log what you already sent under Texts if you replied outside the app.`;
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
    return `Your social score is ${x} out of 100 because the touch rhythm you set under Style (about every ${goal} day${goal === 1 ? "" : "s"} for that tier) is not lining up with what is logged for ${n} and possibly others. Send a check-in or log a touchpoint under Texts to bring this up.`;
  }

  if (avg < 45) {
    return `Your social score is ${x} out of 100 — several threads look quiet compared to the priorities you set. Small replies and logging what you send are the fastest way to move this number.`;
  }

  if (avg >= 68) {
    return `Your social score is ${x} out of 100. You are broadly keeping up with the people on this list relative to what you told the app. Keep Texts updated so it stays true.`;
  }

  return `Your social score is ${x} out of 100. Some relationships look on track; others could use a nudge to match how you ranked them. Reply where it counts and log what you do.`;
}
