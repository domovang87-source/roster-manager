import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

type Tier = "A" | "B" | "C";

const DEFAULT_REMIND_DAYS: Record<Tier, number> = { A: 7, B: 14, C: 30 };

const allClear = "All quiet. No one needs attention right now.";

export async function GET() {
  try {
    const supabase = await createServerSupabase();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ synopsis: allClear });
    }

    const [prospectsRes, messagesRes, dismissedRes, draftsRes, rulesRes] = await Promise.all([
      supabase.from("prospects").select("id,name,tier"),
      supabase
        .from("messages")
        .select("prospect_id,created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase
        .from("scheduled_replies")
        .select("prospect_id,dismissed_at")
        .eq("status", "dismissed")
        .not("dismissed_at", "is", null)
        .order("dismissed_at", { ascending: false })
        .limit(5000),
      supabase.from("scheduled_replies").select("prospect_id").eq("status", "scheduled").limit(100),
      supabase.from("tier_rules").select("tier,remind_after_days"),
    ]);

    const prospects = prospectsRes.data ?? [];
    const messages = messagesRes.data ?? [];
    const dismissed = dismissedRes.data ?? [];
    const drafts = draftsRes.data ?? [];
    const rules = rulesRes.data ?? [];

    if (prospects.length === 0) {
      return NextResponse.json({ synopsis: allClear });
    }

    const remindDays: Record<string, number> = {};
    rules.forEach((r) => {
      if (r.tier && typeof r.remind_after_days === "number") {
        remindDays[r.tier as string] = r.remind_after_days;
      }
    });

    const lastActivity = new Map<string, string>();
    for (const msg of messages) {
      const pid = msg.prospect_id as string;
      if (!lastActivity.has(pid)) {
        lastActivity.set(pid, msg.created_at as string);
      }
    }
    for (const row of dismissed) {
      const pid = row.prospect_id as string;
      if (!lastActivity.has(pid)) {
        lastActivity.set(pid, row.dismissed_at as string);
      }
    }

    const now = Date.now();
    const staleProspects: string[] = [];
    const activeANames: string[] = [];

    for (const p of prospects) {
      const pid = String(p.id);
      const tier = p.tier as Tier;
      const name = p.name as string;
      const threshold = remindDays[tier] ?? DEFAULT_REMIND_DAYS[tier] ?? 14;
      const last = lastActivity.get(pid);

      if (!last) {
        staleProspects.push(`${name} (${tier}-Tier) — no activity logged yet`);
        continue;
      }

      const daysSince = Math.floor((now - new Date(last).getTime()) / 86_400_000);
      if (daysSince >= threshold) {
        staleProspects.push(`${name} (${tier}-Tier) — ${daysSince}d since last interaction, threshold is ${threshold}d`);
      }

      if (tier === "A" && daysSince < 2) {
        activeANames.push(name);
      }
    }

    const draftCount = drafts.length;

    const snippets: string[] = [];
    if (staleProspects.length > 0) {
      snippets.push(
        `Overdue: ${staleProspects
          .slice(0, 4)
          .map((s) => s.replace(/\s+—\s+threshold.*$/i, ""))
          .join("; ")}.`
      );
    } else {
      snippets.push("Everyone is up to date.");
    }
    if (activeANames.length > 0) {
      snippets.push(`Recent A-Tier activity: ${activeANames.join(", ")}.`);
    }
    if (draftCount > 0) {
      snippets.push(`${draftCount} draft(s) waiting.`);
    }

    const synopsis = snippets.join(" ").trim() || allClear;
    return NextResponse.json({ synopsis });
  } catch (err) {
    console.error("daily-narrative error:", err);
    return NextResponse.json({ synopsis: allClear });
  }
}
