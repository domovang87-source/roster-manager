import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { computeEnergyLeakFlag } from "@/lib/portfolio-stats";

type Tier = "A" | "B" | "C";

const DEFAULT_REMIND_DAYS: Record<Tier, number> = { A: 7, B: 14, C: 30 };

const allClear = "All quiet. No one needs attention right now.";

/** User hid the card (X): pause briefing until they get a new inbound text or restore the card. */
function isBriefingSnoozed(
  briefingClearedAt: string | null | undefined,
  lastInboundIso: string | undefined
): boolean {
  if (!briefingClearedAt) return false;
  const clearedMs = new Date(briefingClearedAt).getTime();
  if (!lastInboundIso) return true;
  return new Date(lastInboundIso).getTime() <= clearedMs;
}

export async function GET() {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ synopsis: allClear, tacticalNotes: [] as string[] });
    }

    const [prospectsRes, messagesRes, draftsRes, rulesRes] = await Promise.all([
      supabase.from("prospects").select("id,name,tier,briefing_cleared_at"),
      supabase
        .from("messages")
        .select("prospect_id,created_at,direction")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("scheduled_replies").select("prospect_id").eq("status", "scheduled").limit(100),
      supabase.from("tier_rules").select("tier,remind_after_days"),
    ]);

    if (prospectsRes.error) {
      if (
        prospectsRes.error.message?.includes("briefing_cleared_at") ||
        prospectsRes.error.message?.includes("column")
      ) {
        console.error(
          "daily-narrative: add prospects.briefing_cleared_at (see supabase/prospects-briefing-cleared-migration.sql)"
        );
      } else {
        console.error("daily-narrative prospects error:", prospectsRes.error);
      }
      return NextResponse.json({ synopsis: allClear, tacticalNotes: [] as string[] });
    }

    const prospects = prospectsRes.data ?? [];
    const messages = messagesRes.data ?? [];
    const drafts = draftsRes.data ?? [];
    const rules = rulesRes.data ?? [];

    if (prospects.length === 0) {
      return NextResponse.json({ synopsis: allClear, tacticalNotes: [] as string[] });
    }

    const remindDays: Record<string, number> = {};
    rules.forEach((r) => {
      if (r.tier && typeof r.remind_after_days === "number") {
        remindDays[r.tier as string] = r.remind_after_days;
      }
    });

    const lastAnyActivity = new Map<string, string>();
    const lastInbound = new Map<string, string>();
    for (const msg of messages) {
      const pid = msg.prospect_id as string;
      const at = msg.created_at as string;
      const dir = msg.direction as string;
      if (!lastAnyActivity.has(pid)) {
        lastAnyActivity.set(pid, at);
      }
      if (dir === "inbound" && !lastInbound.has(pid)) {
        lastInbound.set(pid, at);
      }
    }

    const now = Date.now();
    const nowTs = now;
    const sevenAgoTs = nowTs - 7 * 86_400_000;
    const count7dByProspect = new Map<string, number>();
    for (const m of messages) {
      const pid = String((m as { prospect_id?: string }).prospect_id ?? "");
      if (!pid) continue;
      const ts = new Date((m as { created_at?: string }).created_at ?? 0).getTime();
      if (Number.isNaN(ts) || ts < sevenAgoTs) continue;
      count7dByProspect.set(pid, (count7dByProspect.get(pid) ?? 0) + 1);
    }
    let maxA7d = 0;
    for (const p of prospects) {
      if ((p.tier as Tier) !== "A") continue;
      maxA7d = Math.max(maxA7d, count7dByProspect.get(String(p.id)) ?? 0);
    }
    const hasATier = prospects.some((p) => (p.tier as Tier) === "A");

    const tierById = new Map<string, Tier>();
    for (const p of prospects) {
      tierById.set(String(p.id), p.tier as Tier);
    }
    const ibObByProspect = new Map<string, { ib: number; ob: number }>();
    for (const m of messages) {
      const pid = String((m as { prospect_id?: string }).prospect_id ?? "");
      if (!pid || tierById.get(pid) !== "C") continue;
      const dir = (m as { direction?: string }).direction;
      const cur = ibObByProspect.get(pid) ?? { ib: 0, ob: 0 };
      if (dir === "inbound") cur.ib += 1;
      else if (dir === "outbound") cur.ob += 1;
      ibObByProspect.set(pid, cur);
    }

    const tacticalNotes: string[] = [];
    for (const p of prospects) {
      const tier = p.tier as Tier;
      const pid = String(p.id);
      const c7 = count7dByProspect.get(pid) ?? 0;
      if (computeEnergyLeakFlag(tier, c7, maxA7d, hasATier)) {
        const who = String(p.name ?? "Them").split(/\s+/)[0] || "Them";
        tacticalNotes.push(
          `Energy leak: ${who} is supposed to be casual (C-tier), but they’ve logged more touches in the last 7 days than your busiest A-list person. Your focus is sneaking the wrong direction.`
        );
      }
      if (tier === "C") {
        const st = ibObByProspect.get(pid);
        if (st && st.ib + st.ob >= 4 && st.ob >= st.ib * 3 && st.ob >= 5) {
          const who = String(p.name ?? "Them").split(/\s+/)[0] || "Them";
          const sum = st.ib + st.ob;
          const yourPct = sum > 0 ? Math.round((st.ob / sum) * 100) : 0;
          tacticalNotes.push(
            `Didn’t you say ${who} was C-tier? In your log with them, ${yourPct}% of the lines are yours. That’s you carrying a “low priority” label — back off and let them earn the next move.`
          );
        }
      }
    }

    const staleProspects: string[] = [];
    const activeANames: string[] = [];

    for (const p of prospects) {
      const pid = String(p.id);
      const tier = p.tier as Tier;
      const name = p.name as string;
      const clearedAt = p.briefing_cleared_at as string | null | undefined;

      if (isBriefingSnoozed(clearedAt, lastInbound.get(pid))) {
        continue;
      }

      const threshold = remindDays[tier] ?? DEFAULT_REMIND_DAYS[tier] ?? 14;
      const last = lastAnyActivity.get(pid);

      if (!last) {
        staleProspects.push(`${name} (${tier}-tier) — nothing logged yet, so the app can’t see a thread`);
        continue;
      }

      const daysSince = Math.floor((now - new Date(last).getTime()) / 86_400_000);
      if (daysSince >= threshold) {
        staleProspects.push(
          `${name}: ${daysSince} days since you logged anything — you told the app ~every ${threshold} days for ${tier}-tier. Catch up or log what you already did.`
        );
      }

      const inAt = lastInbound.get(pid);
      if (tier === "A" && inAt) {
        const daysSinceIn = Math.floor((now - new Date(inAt).getTime()) / 86_400_000);
        if (daysSinceIn < 2) {
          activeANames.push(name);
        }
      }
    }

    const draftCount = drafts.length;

    const snippets: string[] = [];
    if (staleProspects.length > 0) {
      snippets.push(`Behind: ${staleProspects.slice(0, 4).join(" · ")}`);
    } else {
      snippets.push("Nobody’s glaringly overdue by the rhythms you set.");
    }
    if (activeANames.length > 0) {
      snippets.push(`Your A-list pinged you recently: ${activeANames.join(", ")} — don’t leave them on read (or log if you already replied).`);
    }
    if (draftCount > 0) {
      snippets.push(`${draftCount} draft${draftCount === 1 ? "" : "s"} sitting there — send or delete, your call.`);
    }

    const synopsis = snippets.join(" ").trim() || allClear;
    const uniqueTactical = [...new Set(tacticalNotes)];
    return NextResponse.json({ synopsis, tacticalNotes: uniqueTactical });
  } catch (err) {
    console.error("daily-narrative error:", err);
    return NextResponse.json({ synopsis: allClear, tacticalNotes: [] as string[] });
  }
}
