import type { MomentumContext } from "./momentum-insight";
import type { Tier } from "./roster-portfolio-compute";

type Msg = { prospect_id?: string; created_at?: string; direction?: string };

/**
 * Client-side tactical lines when logs break tier discipline (uses viewer local time).
 */
export function buildPulseTacticalNotes(
  prospects: { id: string; tier: Tier }[],
  messages: Msg[],
  now = new Date()
): string[] {
  const tierById = new Map(prospects.map((p) => [p.id, p.tier]));
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
      notes.push(
        "⚠️ Energy leak: a C-tier is out-logging your busiest A this week — pull attention uphill."
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
      notes.push(
        "Tactical: Outbound to C-tier logged between 12am–5am local — revert to observation mode; reserve prime energy for A-tier."
      );
      break;
    }
  }

  return [...new Set(notes)];
}

export function tacticalNoteFromContext(
  tier: Tier,
  ctx: MomentumContext | undefined,
  momentum: number | undefined
): string | null {
  if (!ctx || ctx.total === 0) return null;
  const ob = ctx.outboundText ?? ctx.outbound;
  const ib = ctx.inboundText ?? ctx.inbound;
  if (tier === "C" && ob >= 4 && ob > ib * 2) {
    return "Audit: Heavy outbound on C-tier — match cadence to tier. Observation beats pursuit here.";
  }
  if (tier === "C" && (momentum ?? 0) < 25 && ob >= 3) {
    return "Audit: Low thread heat on C with volume from you — stop feeding. Let the frame rest.";
  }
  return null;
}
