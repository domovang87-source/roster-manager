/**
 * Momentum cadence from Logic Lab "check-in frequency" (tier_rules.remind_after_days)
 * vs days since the user's last logged outbound message.
 */

export type RulesTier = "A" | "B" | "C";

export const DEFAULT_REMIND_DAYS_BY_TIER: Record<RulesTier, number> = {
  A: 3,
  B: 14,
  C: 30,
};

export function normalizeRemindDays(value: unknown, tierFallback: number): number {
  const fb = Math.min(90, Math.max(1, Math.round(tierFallback)));
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.min(90, Math.max(1, Math.round(value)));
  }
  return fb;
}

/**
 * 0–42: high when last outbound is within the user's chosen check-in window; falls off when overdue.
 */
export function checkInCadenceScore(
  lastOutboundIso: string | undefined,
  remindAfterDays: number,
  totalLogged: number,
  now: Date
): number {
  const goal = Math.min(90, Math.max(1, remindAfterDays));
  if (!lastOutboundIso) {
    if (totalLogged === 0) return 0;
    return 8;
  }
  const ms = now.getTime() - new Date(lastOutboundIso).getTime();
  const days = ms < 0 ? 0 : Math.floor(ms / 86_400_000);
  const ratio = days / goal;
  if (ratio <= 0.35) return 42;
  if (ratio <= 1) return Math.round(42 - (ratio - 0.35) * (12 / 0.65));
  if (ratio <= 1.75) return Math.round(30 - (ratio - 1) * (22 / 0.75));
  if (ratio <= 2.5) return Math.round(8 - (ratio - 1.75) * (7 / 0.75));
  return 0;
}

function volumeCadenceBoost(totalLogged: number, tier: RulesTier): number {
  if (totalLogged <= 0) return 0;
  const s = Math.sqrt(totalLogged);
  if (tier === "A") return Math.min(14, s * 2.2);
  if (tier === "C") return Math.min(18, s * 3);
  return Math.min(16, s * 2.6);
}

/** Rules-first cadence (mostly check-in vs goal) with a small boost for how much you've logged. */
export function blendedRulesCadenceScore(
  lastOutboundIso: string | undefined,
  remindAfterDays: number,
  totalLogged: number,
  tier: RulesTier,
  now: Date
): number {
  if (totalLogged === 0) return 0;
  const check = checkInCadenceScore(lastOutboundIso, remindAfterDays, totalLogged, now);
  const vol = volumeCadenceBoost(totalLogged, tier);
  return Math.min(42, Math.round(check * 0.82 + vol * 0.18));
}
