/**
 * Match screenshot thread header text (e.g. "Dan Anesthesiologist") to a roster contact
 * (e.g. "Dan (Doctor)") by stripping parentheticals and common role/profession words.
 */

const ROLE_WORDS = [
  "anesthesiologist",
  "anesthesia",
  "anesthetist",
  "doctor",
  "dr",
  "md",
  "do",
  "rn",
  "np",
  "pa",
  "crna",
  "nurse",
  "nursing",
  "resident",
  "fellow",
  "surgeon",
  "physician",
  "dentist",
  "orthodontist",
  "lawyer",
  "attorney",
  "esq",
  "teacher",
  "professor",
  "student",
  "engineer",
  "designer",
  "manager",
  "director",
  "ceo",
  "cfo",
  "realtor",
  "broker",
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Lowercase, drop parentheticals, remove profession tokens, collapse spaces. */
export function compactIdentityLabel(raw: string): string {
  let t = raw.toLowerCase().replace(/\([^)]*\)/g, " ");
  for (const w of ROLE_WORDS) {
    t = t.replace(new RegExp(`\\b${escapeRe(w)}\\b`, "gi"), " ");
  }
  t = t.replace(/[^a-z0-9\s'-]/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}

function tokens(compact: string): string[] {
  return compact.split(/\s+/).filter((x) => x.length >= 2);
}

function scorePair(threadCompact: string, prospectCompact: string): number {
  if (!threadCompact || !prospectCompact) return 0;
  if (threadCompact === prospectCompact) return 100;
  if (threadCompact.length >= 3 && prospectCompact.length >= 3) {
    if (threadCompact.includes(prospectCompact)) return 88;
    if (prospectCompact.includes(threadCompact)) return 88;
  }
  const tt = tokens(threadCompact);
  const pt = tokens(prospectCompact);
  if (tt.length === 0 || pt.length === 0) return 0;
  if (tt[0] === pt[0]) {
    const restOverlap = tt.slice(1).some((x) => pt.includes(x)) || pt.slice(1).some((x) => tt.includes(x));
    if (restOverlap) return 82;
    if (tt.length === 1 && pt.length === 1) return 78;
    return 55;
  }
  const setT = new Set(tt);
  let inter = 0;
  for (const x of pt) if (setT.has(x)) inter++;
  const uni = setT.size + new Set(pt).size - inter;
  return uni > 0 ? Math.round((inter / uni) * 45) : 0;
}

/**
 * Returns prospect id if there is a single clear roster match for the thread title; otherwise undefined.
 */
export function guessProspectIdFromThreadHint(
  threadTitle: string | null | undefined,
  prospects: ReadonlyArray<{ id: string; name: string }>
): string | undefined {
  const hint = (threadTitle ?? "").trim();
  if (!hint || prospects.length === 0) return undefined;

  const threadCompact = compactIdentityLabel(hint);
  if (threadCompact.length < 2) return undefined;

  const scored = prospects.map((p) => ({
    id: p.id,
    score: scorePair(threadCompact, compactIdentityLabel(p.name)),
  }));

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const second = scored[1];
  if (!best || best.score < 52) return undefined;
  if (second && second.score >= best.score - 8) return undefined;
  return best.id;
}
