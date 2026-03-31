import type { MomentumContext } from "./momentum-insight";
import type { Tier } from "./roster-portfolio-compute";

type Msg = { prospect_id?: string; created_at?: string; direction?: string };

export type TacticalProspect = { id: string; tier: Tier; name: string };

function firstName(full: string): string {
  return (full.split(/\s+/)[0] || full || "They").replace(/,$/, "");
}

/**
 * Client-side tactical lines when logs break tier discipline (uses viewer local time).
 */
export function buildPulseTacticalNotes(
  prospects: TacticalProspect[],
  messages: Msg[],
  now = new Date()
): string[] {
  const tierById = new Map(prospects.map((p) => [p.id, p.tier]));
  const nameById = new Map(prospects.map((p) => [p.id, p.name || "Them"]));
  const sevenAgo = now.getTime() - 7 * 86_400_000;
  const notes: string[] = [];

  let maxA7d = 0;
  const count7d = new Map<string, number>();
  for (const m of messages) {
    const pid = m.prospect_id ? String(m.prospect_id) : "";
    if (!pid) continue;
    const ts = m.created_at ? new Date(m.created_at).getTime() : NaN;
    if (Number.isNaN(ts) || ts < sevenAgo) continue;
    count7d.set(pid, (count7d.get(pid) ?? 0) + 1);
  }
  for (const p of prospects) {
    if (p.tier !== "A") continue;
    maxA7d = Math.max(maxA7d, count7d.get(p.id) ?? 0);
  }
  const hasA = prospects.some((p) => p.tier === "A");

  for (const p of prospects) {
    if (p.tier !== "C" || !hasA) continue;
    const n = count7d.get(p.id) ?? 0;
    if (n > maxA7d) {
      const who = firstName(p.name);
      notes.push(
        `You put ${who} in casual (C-tier), but this week they’ve got more logged touches than your busiest A-list person. That’s your attention sliding downhill.`
      );
      break;
    }
  }

  for (const m of messages) {
    if (m.direction !== "outbound") continue;
    const pid = m.prospect_id ? String(m.prospect_id) : "";
    if (!pid || tierById.get(pid) !== "C") continue;
    const d = m.created_at ? new Date(m.created_at) : null;
    if (!d) continue;
    const h = d.getHours();
    if (h >= 0 && h < 5) {
      const who = firstName(nameById.get(pid) ?? "them");
      notes.push(
        `Late-night text to ${who} (C-tier) between midnight and 5am? That’s prime-you hours going to someone you ranked low. Go to bed; save the juice for people you actually prioritized.`
      );
      break;
    }
  }

  return [...new Set(notes)];
}

export function tacticalNoteFromContext(
  tier: Tier,
  ctx: MomentumContext | undefined,
  momentum: number | undefined,
  displayName: string
): string | null {
  if (!ctx || ctx.total === 0) return null;
  const ob = ctx.outboundText ?? ctx.outbound;
  const ib = ctx.inboundText ?? ctx.inbound;
  const who = firstName(displayName);
  const lines = ib + ob;
  const yourPct = lines > 0 ? Math.round((ob / lines) * 100) : 0;

  if (tier === "C" && ob >= 4 && ob > ib * 2) {
    return `Didn’t you tag ${who} as C-tier? In what you logged with them, ${yourPct}% of the lines are yours — that’s you doing the work for a “casual” slot. Cool it unless you meant to upgrade them.`;
  }
  if (tier === "C" && (momentum ?? 0) < 25 && ob >= 3) {
    return `${who} is C-tier, the thread’s basically cold (${momentum ?? 0}/100), and you’re still the one blowing up the log. Stop feeding it air.`;
  }
  return null;
}
