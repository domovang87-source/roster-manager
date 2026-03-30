import type { MomentumContext } from "./momentum-insight";
import {
  communicationStyleFromContext,
  computeEnergyLeakFlag,
  type PortfolioProspect,
  type SocialEquityRow,
} from "./portfolio-stats";
import { isReactionMessageBody } from "./roster-portfolio-compute";

export type SocialEquityMessageRow = {
  prospect_id?: string | null;
  created_at?: string | null;
  direction?: string | null;
  event_type?: string | null;
  body?: string | null;
};

const MS_7D = 7 * 86_400_000;

/** Per-prospect inboundText / outboundText counts in the last 7 days (same rules as thread aggregate). */
export function buildInboundOutboundText7dByProspect(
  messages: SocialEquityMessageRow[],
  now: Date
): Map<string, { inboundText: number; outboundText: number }> {
  const cutoff = now.getTime() - MS_7D;
  const map = new Map<string, { inboundText: number; outboundText: number }>();
  const bump = (pid: string) => {
    if (!map.has(pid)) map.set(pid, { inboundText: 0, outboundText: 0 });
    return map.get(pid)!;
  };

  for (const row of messages) {
    const at = row.created_at ? new Date(row.created_at as string).getTime() : NaN;
    if (Number.isNaN(at) || at < cutoff) continue;
    const pid = row.prospect_id ? String(row.prospect_id) : "";
    if (!pid) continue;
    const isNote = row.event_type === "note";
    const bodyStr = String(row.body ?? "");
    const isReaction = isReactionMessageBody(bodyStr);
    const isInbound = String(row.direction ?? "").toLowerCase() === "inbound";
    const agg = bump(pid);
    if (isInbound) {
      if (!isReaction) agg.inboundText += 1;
    } else {
      if (!isNote && !isReaction) agg.outboundText += 1;
    }
  }
  return map;
}

function syntheticContextForStyle(
  p: PortfolioProspect,
  inboundText: number,
  outboundText: number
): MomentumContext {
  const ib = inboundText;
  const ob = outboundText;
  const total = ib + ob;
  return {
    tier: p.tier,
    remindAfterDays: p.momentumContext?.remindAfterDays ?? 3,
    inbound: ib,
    outbound: ob,
    inboundText: ib,
    outboundText: ob,
    total,
    noteCount: 0,
    touchBaseCount: 0,
  };
}

/** Social equity rows using only messages from the last 7 days (trend / “lately” view). */
export function buildSocialEquityRowsLast7d(
  prospects: PortfolioProspect[],
  messages: SocialEquityMessageRow[],
  now: Date,
  count7dByProspect: Map<string, number>,
  maxA7d: number,
  hasATier: boolean
): SocialEquityRow[] {
  const byPid = buildInboundOutboundText7dByProspect(messages, now);
  return prospects.map((p) => {
    const { inboundText: ib, outboundText: ob } = byPid.get(p.id) ?? { inboundText: 0, outboundText: 0 };
    const sum = ib + ob;
    const count7d = count7dByProspect.get(p.id) ?? 0;
    const synth = syntheticContextForStyle(p, ib, ob);
    return {
      id: p.id,
      name: p.name,
      tier: p.tier,
      inbound: ib,
      outbound: ob,
      outboundPct: sum === 0 ? 0 : Math.round((ob / sum) * 100),
      styleLabel: communicationStyleFromContext(synth, p.momentum),
      energyLeak: computeEnergyLeakFlag(p.tier, count7d, maxA7d, hasATier),
    };
  });
}
