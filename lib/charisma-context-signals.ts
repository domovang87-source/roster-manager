/**
 * Lightweight, explainable adjustments for Active Charisma — no LLM.
 * Vibe notes + recent bubble text nudge penalties/bonuses within tight caps.
 */

export type CharismaVibeAdjust = {
  /** 0–1: one-sided outbound is more OK (friend / work / low stakes). */
  imbalanceRelief: number;
  /** 0–1: “you texted last / waiting on them” stings less. */
  openLoopRelief: number;
  /** 0–1: Rhythm overdue pressure slightly lighter. */
  cadenceRelief: number;
};

const EMPTY_VIBE: CharismaVibeAdjust = {
  imbalanceRelief: 0,
  openLoopRelief: 0,
  cadenceRelief: 0,
};

/**
 * Reads prospect `vibe_notes` — user intent, not facts about the thread.
 */
export function charismaAdjustFromVibeNotes(raw: string | undefined | null): CharismaVibeAdjust {
  if (!raw?.trim()) return EMPTY_VIBE;
  const t = raw.toLowerCase();
  let ib = 0;
  let ol = 0;
  let cad = 0;

  if (
    /\b(just a friend|only a friend|friends only|just friends|platonic|not romantic|no romantic|not dating)\b/.test(t)
  ) {
    ib += 0.42;
    ol += 0.22;
  }
  if (
    /\b(work friend|coworker|colleague|networking|linkedin|mentor|mentee|business contact|professional)\b/.test(t)
  ) {
    ib += 0.38;
    ol += 0.18;
  }
  if (/\b(product|demo|beta|startup|pitch|ai product|my product|user research|feedback)\b/.test(t)) {
    ib += 0.32;
    ol += 0.2;
  }
  if (/\b(ok(ay)?|fine|normal|cool)\b.{0,48}\b(if i|to|for me to)\b.{0,32}\b(text|ask|message|reach out|ping)\b/.test(t)) {
    ib += 0.18;
    ol += 0.2;
  }
  if (/\b(low stakes|low pressure|no pressure|casual|not serious)\b/.test(t)) {
    ib += 0.22;
    ol += 0.2;
    cad += 0.18;
  }
  if (/\b(questions about|pick your brain|advice on|help with)\b/.test(t)) {
    ib += 0.15;
    ol += 0.12;
  }

  return {
    imbalanceRelief: Math.min(0.78, ib),
    openLoopRelief: Math.min(0.55, ol),
    cadenceRelief: Math.min(0.4, cad),
  };
}

/** 0–100: apology / repair / affection in their recent lines (logged inbound text). */
export function inboundRepairAndAffectionScore(bodies: string[]): number {
  if (!bodies.length) return 0;
  const text = bodies.join(" ").toLowerCase();
  let s = 0;
  if (/\b(so\s+)?sorry|i apologize|apolog|forgive me|forgive you|my fault|i was wrong|i messed up|i fucked up\b/.test(text)) {
    s += 38;
  }
  if (/\b(i\s+)?love\s+you|love u\b|miss you|mean(s)?\s+(everything|the world|so much)\b/.test(text)) {
    s += 32;
  }
  if (/\bmake it right|promise|won'?t happen|never meant|didn'?t mean to|hear me out\b/.test(text)) {
    s += 22;
  }
  if (/\bplease\b.{0,24}\b(forgive|understand|talk|listen)\b|\bdon'?t be mad\b|\bi care about you\b/.test(text)) {
    s += 18;
  }
  return Math.min(100, s);
}

/** 0–100: confrontational / venting outbound cluster (your recent lines). */
export function outboundConflictIntensity(bodies: string[]): number {
  if (!bodies.length) return 0;
  const text = bodies.slice(0, 6).join(" ").toLowerCase();
  let s = 0;
  if (/\b(i\s+)?hate\s+you|fuck\s+you|go to hell\b/.test(text)) s += 55;
  if (/\b(so\s+)?mad at you|pissed|furious|how could you|can'?t believe you\b/.test(text)) s += 38;
  if (/\bdone with you|over this|never want to|so done\b/.test(text)) s += 28;
  if (/\bwhy did you|you always|you never|so sick of\b/.test(text)) s += 18;
  return Math.min(100, s);
}

export function repairBonusForScore(
  latestDirection: "inbound" | "outbound" | undefined,
  repairScore: number,
  conflictScore: number
): number {
  if (latestDirection !== "inbound" || repairScore < 28) return 0;
  let bonus = Math.min(14, Math.round(repairScore / 7));
  if (conflictScore >= 40) bonus = Math.round(bonus * 0.62);
  else if (conflictScore >= 22) bonus = Math.round(bonus * 0.82);
  return bonus;
}
