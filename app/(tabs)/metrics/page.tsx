"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, CircleHelp, X } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import { useProStatus } from "../../../lib/use-pro-status";
import {
  buildProspectMomentumStateMap,
  coerceTier,
  remindByTierFromRulesRows,
  type Tier,
} from "../../../lib/roster-portfolio-compute";
import type { PortfolioProspect } from "../../../lib/portfolio-stats";
import { averagePortfolioMomentum, isAtGhostingRisk } from "../../../lib/portfolio-stats";
import { buildSocialScoreSynopsis, SOCIAL_SCORE_EXPLAINER } from "../../../lib/social-score-narrative";
import { getIsoWeekKeyLocal } from "../../../lib/portfolio-week-storage";
import { messagesVolumeByWeek } from "../../../lib/pulse-volume-by-week";
import { formatIsoWeekAxisLabel, formatIsoWeekTooltipPrefix } from "../../../lib/iso-week-label";
import { recordPulseWeekAvg, readPulseAvgHistory } from "../../../lib/pulse-avg-history";

type ProspectRow = {
  id: string;
  name?: string | null;
  tier?: unknown;
};

type AllocationRow = {
  id: string;
  name: string;
  tier: Tier;
  count7d: number;
  /** C-tier 7d activity exceeds every A-tier person’s 7d activity (and you have at least one A). */
  leak: boolean;
};

/** Donut segment from a0→a1 radians (start at top = -π/2). */
function donutWedgePath(cx: number, cy: number, R: number, rInner: number, a0: number, a1: number): string {
  const x0o = cx + R * Math.cos(a0);
  const y0o = cy + R * Math.sin(a0);
  const x1o = cx + R * Math.cos(a1);
  const y1o = cy + R * Math.sin(a1);
  const x0i = cx + rInner * Math.cos(a0);
  const y0i = cy + rInner * Math.sin(a0);
  const x1i = cx + rInner * Math.cos(a1);
  const y1i = cy + rInner * Math.sin(a1);
  const largeArc = a1 - a0 > Math.PI ? 1 : 0;
  return `M ${x0o} ${y0o} A ${R} ${R} 0 ${largeArc} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x0i} ${y0i} Z`;
}

function donutFullRing(cx: number, cy: number, R: number, rInner: number): string {
  return [
    `M ${cx + R} ${cy}`,
    `A ${R} ${R} 0 1 1 ${cx - R} ${cy}`,
    `A ${R} ${R} 0 1 1 ${cx + R} ${cy}`,
    `M ${cx + rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 0 ${cx - rInner} ${cy}`,
    `A ${rInner} ${rInner} 0 1 0 ${cx + rInner} ${cy}`,
  ].join(" ");
}

const TIER_PIE_META = [
  { key: "A" as const, label: "A-list", dot: "bg-amber-400", fill: "rgba(245, 158, 11, 0.88)" },
  { key: "B" as const, label: "B-tier", dot: "bg-sky-400", fill: "rgba(56, 189, 248, 0.62)" },
  { key: "C" as const, label: "C-tier", dot: "bg-slate-400", fill: "rgba(100, 116, 139, 0.78)" },
];

/** Donut + HTML legend — avoids cramped SVG labels on wedges. */
function RosterTierPie({
  tierCounts,
}: {
  tierCounts: Record<"A" | "B" | "C", number>;
}) {
  const total = tierCounts.A + tierCounts.B + tierCounts.C;
  const cx = 50;
  const cy = 50;
  const R = 44;
  const rInner = 26;

  const segments = TIER_PIE_META.map((m) => ({ ...m, n: tierCounts[m.key] })).filter((s) => s.n > 0);

  const pieSvg = (inner: React.ReactNode) => (
    <svg
      viewBox="0 0 100 100"
      className="h-[7.25rem] w-[7.25rem] shrink-0 drop-shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
      role="img"
      aria-label={`Roster by tier: A ${tierCounts.A}, B ${tierCounts.B}, C ${tierCounts.C}`}
    >
      {inner}
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        className="pointer-events-none select-none fill-[var(--rm-text)] font-mono text-[15px] font-semibold tabular-nums"
      >
        {total}
      </text>
      <text
        x={cx}
        y={cy + 14}
        textAnchor="middle"
        className="pointer-events-none select-none fill-[var(--rm-text-muted)] text-[6.5px] font-medium uppercase tracking-[0.14em]"
      >
        roster
      </text>
    </svg>
  );

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
        <svg viewBox="0 0 100 100" className="h-[7.25rem] w-[7.25rem] shrink-0" aria-hidden>
          <circle cx={cx} cy={cy} r={R} fill="rgba(51, 65, 85, 0.45)" stroke="var(--rm-border)" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={rInner} fill="var(--rm-bg-elevated)" stroke="none" />
        </svg>
        <p className="text-xs text-[var(--rm-text-muted)]">No people yet</p>
      </div>
    );
  }

  if (segments.length === 1) {
    const only = segments[0];
    return (
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
        <svg
          viewBox="0 0 100 100"
          className="h-[7.25rem] w-[7.25rem] shrink-0 drop-shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
          role="img"
          aria-label={`Roster by tier: ${only.label} ${only.n}`}
        >
          <path
            d={donutFullRing(cx, cy, R, rInner)}
            fill={only.fill}
            fillRule="evenodd"
            stroke="var(--rm-bg)"
            strokeWidth={1.15}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            className="pointer-events-none select-none fill-[var(--rm-text)] font-mono text-[15px] font-semibold tabular-nums"
          >
            {only.n}
          </text>
          <text
            x={cx}
            y={cy + 11}
            textAnchor="middle"
            className="pointer-events-none select-none fill-[var(--rm-text-muted)] text-[6.5px] font-medium uppercase tracking-[0.14em]"
          >
            {only.label}
          </text>
        </svg>
        <ul className="w-full min-w-0 space-y-2 sm:max-w-[9.5rem]">
          <li className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-[var(--rm-text-muted)]">
              <span className={`h-2 w-2 shrink-0 rounded-full ${only.dot}`} aria-hidden />
              <span className="truncate">{only.label}</span>
            </span>
            <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text)]">{only.n}</span>
          </li>
        </ul>
      </div>
    );
  }

  let angle = -Math.PI / 2;
  const pieces: { key: string; d: string; fill: string }[] = [];

  for (const s of segments) {
    const sweep = (s.n / total) * 2 * Math.PI;
    const a0 = angle;
    const a1 = angle + sweep;
    pieces.push({
      key: s.key,
      d: donutWedgePath(cx, cy, R, rInner, a0, a1),
      fill: s.fill,
    });
    angle = a1;
  }

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      {pieSvg(
        <>
          {pieces.map((p) => (
            <path
              key={p.key}
              d={p.d}
              fill={p.fill}
              stroke="var(--rm-bg)"
              strokeWidth={1.15}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      )}
      <ul className="w-full min-w-0 space-y-2 sm:max-w-[9.5rem]">
        {TIER_PIE_META.map((m) => {
          const n = tierCounts[m.key];
          if (n === 0) return null;
          return (
            <li key={m.key} className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2 text-[var(--rm-text-muted)]">
                <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} aria-hidden />
                <span className="truncate">{m.label}</span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text)]">{n}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function PulsePage() {
  const config = getSupabaseConfig();
  const { accountTier } = useProStatus();
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [brief, setBrief] = React.useState("");
  const [briefLoading, setBriefLoading] = React.useState(true);
  const [activityCount, setActivityCount] = React.useState(0);
  const [rosterTotal, setRosterTotal] = React.useState(0);
  const [tierCounts, setTierCounts] = React.useState<Record<Tier, number>>({ A: 0, B: 0, C: 0 });
  const [avgScore, setAvgScore] = React.useState(0);
  const [aListWaiting, setAListWaiting] = React.useState(0);
  const [msgs7d, setMsgs7d] = React.useState(0);
  const [volumeWeeks, setVolumeWeeks] = React.useState<ReturnType<typeof messagesVolumeByWeek>>([]);
  const [avgHistory, setAvgHistory] = React.useState<{ week: string; avg: number; shortLabel: string }[]>([]);
  const [pulseProspects, setPulseProspects] = React.useState<PortfolioProspect[]>([]);
  const [socialScoreExpanded, setSocialScoreExpanded] = React.useState(false);
  const [stackInfoOpen, setStackInfoOpen] = React.useState(false);
  const [truthMirrorOpen, setTruthMirrorOpen] = React.useState(false);
  const [allocationTop5, setAllocationTop5] = React.useState<AllocationRow[]>([]);

  React.useEffect(() => {
    if (!stackInfoOpen && !truthMirrorOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStackInfoOpen(false);
        setTruthMirrorOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stackInfoOpen, truthMirrorOpen]);

  const load = React.useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setError(`Supabase not configured.`);
      setLoading(false);
      setBriefLoading(false);
      return;
    }

    setError(null);
    setLoading(true);

    const now = new Date();
    const [prospectsRes, messagesRes, rulesRes, countRes, msgsTsRes] = await Promise.all([
      client.from("prospects").select("id,name,tier"),
      client
        .from("messages")
        .select("created_at,body,direction,prospect_id,event_type")
        .order("created_at", { ascending: false })
        .limit(2500),
      client.from("tier_rules").select("tier,remind_after_days"),
      client.from("messages").select("id", { count: "exact", head: true }),
      client.from("messages").select("created_at").order("created_at", { ascending: false }).limit(4000),
    ]);

    if (prospectsRes.error) {
      setError(prospectsRes.error.message);
      setLoading(false);
      setBriefLoading(false);
      return;
    }

    const prospects = (prospectsRes.data ?? []) as ProspectRow[];
    const messages = msgsTsRes.data ?? [];
    const fullMessages = messagesRes.data ?? [];

    setRosterTotal(prospects.length);
    setActivityCount(countRes.count ?? 0);

    const sevenAgo = Date.now() - 7 * 86_400_000;
    setMsgs7d(messages.filter((m) => new Date(m.created_at as string).getTime() >= sevenAgo).length);

    const tc: Record<Tier, number> = { A: 0, B: 0, C: 0 };
    for (const row of prospects) {
      tc[coerceTier(row.tier)] += 1;
    }
    setTierCounts(tc);

    const remindByTier = remindByTierFromRulesRows(rulesRes.data ?? []);
    const momentumMap = buildProspectMomentumStateMap(prospects, fullMessages, remindByTier, now);
    const portfolioProspects = prospects.map((row) => {
      const tier = coerceTier(row.tier);
      const st = momentumMap.get(String(row.id));
      return {
        id: String(row.id),
        name: row.name ?? "Unknown",
        tier,
        momentum: st?.momentum ?? 0,
        momentumContext: st?.momentumContext,
      };
    });
    const avg = averagePortfolioMomentum(portfolioProspects);
    setAvgScore(avg);
    setPulseProspects(portfolioProspects);
    setAListWaiting(portfolioProspects.filter((p) => isAtGhostingRisk(p)).length);

    setVolumeWeeks(messagesVolumeByWeek(messages, 56, 8));

    const sevenAgoTs = now.getTime() - 7 * 86_400_000;
    const count7dByProspect = new Map<string, number>();
    for (const m of fullMessages) {
      const row = m as { created_at?: string; prospect_id?: string };
      const ts = row.created_at ? new Date(row.created_at).getTime() : NaN;
      if (Number.isNaN(ts) || ts < sevenAgoTs) continue;
      const pid = row.prospect_id ? String(row.prospect_id) : "";
      if (!pid) continue;
      count7dByProspect.set(pid, (count7dByProspect.get(pid) ?? 0) + 1);
    }
    let maxA7d = 0;
    for (const row of prospects) {
      if (coerceTier(row.tier) !== "A") continue;
      maxA7d = Math.max(maxA7d, count7dByProspect.get(String(row.id)) ?? 0);
    }
    const top5Alloc: AllocationRow[] = prospects
      .map((row) => {
        const tier = coerceTier(row.tier);
        const count7d = count7dByProspect.get(String(row.id)) ?? 0;
        const leak = tier === "C" && tc.A > 0 && count7d > maxA7d;
        return {
          id: String(row.id),
          name: row.name ?? "Unknown",
          tier,
          count7d,
          leak,
        };
      })
      .sort((a, b) => b.count7d - a.count7d)
      .slice(0, 5);
    setAllocationTop5(top5Alloc);

    const wk = getIsoWeekKeyLocal(now);
    recordPulseWeekAvg(wk, avg);
    const hist = readPulseAvgHistory()
      .slice(-8)
      .map((h) => ({
        week: h.week,
        avg: h.avg,
        shortLabel: formatIsoWeekAxisLabel(h.week),
      }));
    setAvgHistory(hist);

    setLoading(false);

    // Briefing (same rules as Home used to use)
    setBriefLoading(true);
    try {
      if (prospects.length === 0 || (countRes.count ?? 0) === 0) {
        setBrief("Add people and log a text thread — then this becomes a plain-English read on who needs you.");
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch("/api/daily-narrative", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = (await res.json()) as { synopsis?: string };
        setBrief(data.synopsis ?? "Nothing to add yet.");
      }
    } catch {
      setBrief("Couldn’t load briefing. Try again in a moment.");
    } finally {
      setBriefLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!config.urlPresent || !config.keyPresent) {
      setError("Missing Supabase env.");
      setLoading(false);
      return;
    }
    void load();
  }, [load, config.urlPresent, config.keyPresent]);
  const maxVol = Math.max(1, ...volumeWeeks.map((w) => w.count));
  const maxAvgHist = Math.max(100, ...avgHistory.map((h) => h.avg));
  const socialSynopsis = React.useMemo(
    () => buildSocialScoreSynopsis(avgScore, pulseProspects, activityCount),
    [avgScore, pulseProspects, activityCount]
  );
  const hasEnergyLeak = React.useMemo(
    () => allocationTop5.some((r) => r.leak),
    [allocationTop5]
  );

  return (
    <div className="space-y-8 pb-4">
      <header className="relative pr-11 sm:pr-12">
        <button
          type="button"
          onClick={() => setStackInfoOpen(true)}
          className="absolute right-0 top-0 z-10 flex h-9 w-9 items-center justify-center rounded-full text-[var(--rm-text-muted)] opacity-35 transition hover:bg-[var(--rm-bg-elevated)] hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500/50 active:opacity-100"
          aria-label="What is Stack? Open explainer"
          aria-haspopup="dialog"
          aria-expanded={stackInfoOpen}
        >
          <CircleHelp size={22} strokeWidth={1.35} aria-hidden />
        </button>
        <div>
          <Link
            href="/home"
            className="mb-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
          >
            <ArrowLeft size={14} strokeWidth={1.25} />
            Home
          </Link>
          <p className="text-[10px] uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">Pulse</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[var(--rm-text)] sm:text-3xl">
            How you&apos;re running it
          </h1>
          <p className="mt-2 text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">
            Tier ·{" "}
            <span className="text-[var(--rm-text)]">
              {accountTier === null
                ? "…"
                : accountTier === "free"
                  ? "Free"
                  : accountTier === "pro"
                    ? "Pro"
                    : "Elite"}
            </span>
          </p>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-[var(--rm-text-muted)]">
            Charisma Scores, who&apos;s waiting on you, where your attention actually went — then the paper trail.
          </p>
        </div>
      </header>

      {stackInfoOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close explainer"
            onClick={() => setStackInfoOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pulse-stack-info-title"
            className="relative z-[1] max-h-[min(85dvh,calc(100vh-2rem))] w-full max-w-md overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-5 shadow-2xl sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="pulse-stack-info-title" className="text-base font-semibold text-[var(--rm-text)]">
                What is Stack? (and what it&apos;s not)
              </h2>
              <button
                type="button"
                onClick={() => setStackInfoOpen(false)}
                className="shrink-0 rounded-full p-1 text-[var(--rm-text-muted)] transition hover:bg-[var(--rm-bg)] hover:text-[var(--rm-text)]"
                aria-label="Close"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <div className="mt-4 space-y-2.5 text-sm leading-relaxed text-[var(--rm-text-muted)]">
              <p>
                <strong className="text-[var(--rm-text)]">For:</strong> people you want to prioritize in your life.
                A / B / C is how you rank contact with them; <strong className="text-[var(--rm-text)]">Rhythm</strong> is
                how often you mean to check in — C-tier might be monthly for your parents, A-tier might be daily. Add them
                under <strong className="text-[var(--rm-text)]">People</strong>, log threads under{" "}
                <strong className="text-[var(--rm-text)]">Texts</strong> (screenshot or type), and use{" "}
                <strong className="text-[var(--rm-text)]">Home</strong> when you want drafting help.
              </p>
              <p>
                <strong className="text-[var(--rm-text)]">Roster</strong> = only who you choose — not your whole
                contacts app, not “the world.”
              </p>
              <p>
                <strong className="text-[var(--rm-text)]">Not for:</strong> birthdays, a shared calendar, or a
                generic CRM. No b-day fields, no calendar sync — roster, logs, Active Charisma Score, and AI where it helps.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {truthMirrorOpen ? (
        <div
          className="fixed inset-0 z-[120] flex items-end justify-center bg-black/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
          role="presentation"
        >
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close Truth Mirror"
            onClick={() => setTruthMirrorOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="truth-mirror-title"
            className="relative z-[1] max-h-[min(85dvh,calc(100vh-2rem))] w-full max-w-md overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="truth-mirror-title" className="text-base font-semibold text-[var(--rm-text)]">
                The Truth Mirror
              </h2>
              <button
                type="button"
                onClick={() => setTruthMirrorOpen(false)}
                className="shrink-0 rounded-full p-1 text-[var(--rm-text-muted)] transition hover:bg-[var(--rm-bg)] hover:text-[var(--rm-text)]"
                aria-label="Close"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/85">
              Why this matters · Social equity ROI
            </p>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--rm-text-muted)]">
              <p>
                Your time is your only finite resource. A high-status operator sends energy toward the people they marked
                as priorities. If your C-tier activity in the log beats your A-tier activity, you&apos;re{" "}
                <strong className="text-[var(--rm-text)]">leaking leverage</strong> — managing noise instead of compounding
                signal.
              </p>
              <p className="text-[var(--rm-text)]">
                Your activity doesn&apos;t match your priorities. You are over-investing in low-tier contacts. Redirect
                your pings to your A-tier to secure your high-value leads.
              </p>
              <p className="text-xs text-[var(--rm-text-muted)]">
                Stack only sees what you log under Texts — honest logs make this mirror accurate.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--rm-text-muted)]">Loading metrics…</p>
      ) : rosterTotal === 0 ? (
        <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6">
          <p className="text-sm text-[var(--rm-text-muted)]">
            Add someone under <strong className="text-[var(--rm-text)]">People</strong> first. Pulse tracks what
            you log under <strong className="text-[var(--rm-text)]">Texts</strong>.
          </p>
          <Link
            href="/roster"
            className="mt-4 inline-block border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)]"
          >
            Add a person
          </Link>
        </section>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-6">
            <div className="border border-amber-500/20 bg-[var(--rm-bg-elevated)] p-5 lg:p-6">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">
                Active Charisma · roster
              </p>
              <button
                type="button"
                onClick={() => setSocialScoreExpanded((v) => !v)}
                aria-expanded={socialScoreExpanded}
                className="mt-2 flex w-full items-baseline justify-between gap-2 text-left transition hover:opacity-90"
              >
                <span className="font-mono text-4xl font-semibold tabular-nums text-amber-200/95 sm:text-5xl">
                  {avgScore}
                  <span className="ml-1 text-xl font-normal text-[var(--rm-text-muted)] sm:text-2xl">/100</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                  {socialScoreExpanded ? (
                    <>
                      Hide <ChevronUp size={14} strokeWidth={1.5} className="text-amber-200/80" />
                    </>
                  ) : (
                    <>
                      Why? <ChevronDown size={14} strokeWidth={1.5} className="text-amber-200/80" />
                    </>
                  )}
                </span>
              </button>
              {socialScoreExpanded ? (
                <div className="mt-4 space-y-3 border-t border-[var(--rm-border)] pt-4 text-sm leading-relaxed">
                  <p className="text-[var(--rm-text-muted)]">{SOCIAL_SCORE_EXPLAINER}</p>
                  <p className="text-[var(--rm-text)]">{socialSynopsis}</p>
                  <p className="text-xs text-[var(--rm-text-muted)]">
                    On <strong className="text-[var(--rm-text)]">Home</strong>, tap someone&apos;s number for that
                    person only.
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--rm-text-muted)]">
                  Tap <span className="text-[var(--rm-text)]">Why?</span> for the story behind this number.
                </p>
              )}
            </div>

            <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-5 lg:p-6">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">
                Needs your reply
              </p>
              <p className="mt-2 font-mono text-4xl font-semibold tabular-nums text-amber-400/95 sm:text-5xl">
                {aListWaiting}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-[var(--rm-text-muted)]">
                A-list threads where they reached out last and you haven&apos;t closed the loop yet. Zero is the flex.
              </p>
              {hasEnergyLeak ? (
                <p className="mt-4 flex items-start gap-2 border-t border-rose-500/25 pt-4 text-xs leading-snug text-rose-200/90">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400/95" strokeWidth={2} aria-hidden />
                  <span>
                    Energy leak: someone outside your A-list logged more touches this week than your busiest A. See{" "}
                    <strong className="text-[var(--rm-text)]">Truth Mirror</strong> below.
                  </span>
                </p>
              ) : null}
            </div>
          </section>

          <section className="border border-amber-500/25 bg-amber-500/[0.06] p-4 sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.35em] text-amber-200/80">Briefing</p>
            <h2 className="mt-1 text-base font-semibold text-[var(--rm-text)]">What to focus on</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--rm-text-muted)]">
              {briefLoading ? "Loading…" : brief}
            </p>
          </section>

          <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Truth mirror</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Energy allocation</h2>
            <p className="mt-1 text-xs leading-snug text-[var(--rm-text-muted)]">
              <strong className="text-[var(--rm-text)]/90">Portfolio</strong> = who you said matters (tier).{" "}
              <strong className="text-[var(--rm-text)]/90">Allocation</strong> = where your logs went in the last 7 days.
              Tap the charts for the full read.
            </p>
            <button
              type="button"
              onClick={() => setTruthMirrorOpen(true)}
              className="mt-5 w-full cursor-pointer rounded-sm border border-[var(--rm-border)] bg-[var(--rm-bg)]/50 p-4 text-left transition hover:border-amber-500/35 hover:bg-[var(--rm-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500/40 sm:p-5"
            >
              <div className="grid gap-8 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-center sm:gap-8">
                <div className="flex w-full min-w-0 flex-col items-center sm:items-start">
                  <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--rm-text-muted)]">The asset</p>
                  <p className="mt-1 text-[11px] font-medium text-[var(--rm-text)]">Roster by tier</p>
                  {rosterTotal === 0 ? (
                    <p className="mt-4 text-xs text-[var(--rm-text-muted)]">No people yet</p>
                  ) : (
                    <div className="mt-3 w-full">
                      <RosterTierPie tierCounts={tierCounts} />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--rm-text-muted)]">The truth</p>
                  <p className="mt-1 text-[11px] font-medium text-[var(--rm-text)]">
                    Top 5 by messages logged (7d)
                  </p>
                  {allocationTop5.length === 0 || allocationTop5.every((r) => r.count7d === 0) ? (
                    <p className="mt-4 text-xs text-[var(--rm-text-muted)]">
                      No messages in the last 7 days — log under Texts to see who&apos;s eating your attention.
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-3">
                      {allocationTop5.map((row) => {
                        const maxBar = Math.max(1, ...allocationTop5.map((r) => r.count7d));
                        const w = Math.max(6, (row.count7d / maxBar) * 100);
                        const barCls =
                          row.tier === "A"
                            ? "bg-amber-500/75"
                            : row.tier === "B"
                              ? "bg-sky-500/60"
                              : "bg-slate-500/65";
                        return (
                          <li key={row.id}>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="flex min-w-0 items-center gap-1.5 text-[var(--rm-text)]">
                                {row.leak ? (
                                  <AlertTriangle
                                    className="h-3.5 w-3.5 shrink-0 text-rose-400/95"
                                    strokeWidth={2}
                                    aria-label="Possible energy leak: more 7d activity than your busiest A-tier"
                                  />
                                ) : null}
                                <span className="truncate font-medium">{row.name}</span>
                                <span className="shrink-0 font-mono text-[9px] text-[var(--rm-text-muted)]">
                                  {row.tier}
                                </span>
                              </span>
                              <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text-muted)]">
                                {row.count7d}
                              </span>
                            </div>
                            <div
                              className={`mt-1 h-2 overflow-hidden rounded-sm bg-[var(--rm-bg)] ${row.leak ? "ring-1 ring-rose-500/45" : ""}`}
                            >
                              <div className={`h-full rounded-sm ${barCls}`} style={{ width: `${w}%` }} />
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
              <p className="mt-5 text-center text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                Tap anywhere · The Truth Mirror
              </p>
            </button>
          </section>

          <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Trajectory</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Are you improving?</h2>
            <p className="mt-1 text-xs leading-snug text-[var(--rm-text-muted)]">
              Same roster Active Charisma Score as the hero card, snapshotted when you open Pulse. Bars are calendar weeks; labels are
              each week&apos;s <strong className="text-[var(--rm-text)]/90">Monday</strong> — come back often to see the
              curve.
            </p>
            {avgHistory.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--rm-text-muted)]">Come back after a few visits to see a shape.</p>
            ) : (
              <div className="mt-6 flex h-44 gap-1 sm:gap-2">
                {avgHistory.map((h) => {
                  const pct = Math.max(8, (h.avg / maxAvgHist) * 100);
                  return (
                    <div key={h.week} className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex min-h-0 flex-1 flex-col justify-end rounded-b-sm bg-[var(--rm-bg)]/80">
                        <div
                          className="mx-auto w-full max-w-[2.75rem] rounded-t-sm bg-gradient-to-t from-emerald-900/40 to-emerald-500/35"
                          style={{ height: `${pct}%`, minHeight: "0.5rem" }}
                          title={`${formatIsoWeekTooltipPrefix(h.week)} · Active Charisma Score ${h.avg} / 100`}
                        />
                      </div>
                      <span className="mt-2 block text-center font-mono text-[9px] text-[var(--rm-text-muted)]">
                        {h.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="border border-[var(--rm-border)]/80 bg-[var(--rm-bg-elevated)]/80 p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Activity · reference</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Logging volume</h2>
            <p className="mt-1 max-w-2xl text-xs leading-snug text-[var(--rm-text-muted)]">
              Roster size and raw log counts — useful, but the scoreboard above is what you&apos;re actually optimizing.
            </p>
            <div className="mt-4 flex flex-wrap items-baseline gap-x-8 gap-y-3 border-b border-[var(--rm-border)]/60 pb-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">Roster</p>
                <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-[var(--rm-text)]">
                  {rosterTotal}
                </p>
                <p className="mt-0.5 text-[10px] text-[var(--rm-text-muted)]">
                  A {tierCounts.A} · B {tierCounts.B} · C {tierCounts.C}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">Logs (7d)</p>
                <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums text-[var(--rm-text)]">{msgs7d}</p>
                <p className="mt-0.5 text-[10px] text-[var(--rm-text-muted)]">{activityCount} all-time rows</p>
              </div>
            </div>
            {volumeWeeks.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--rm-text-muted)]">No weekly bars yet — log under Texts.</p>
            ) : (
              <div className="mt-4">
                <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                  Messages per week (~8 weeks)
                </p>
                <div className="mt-3 flex h-28 gap-1 rounded-b-sm bg-[var(--rm-bg)]/60 sm:h-32 sm:gap-2">
                  {volumeWeeks.map((w) => {
                    const pct = Math.max(8, (w.count / maxVol) * 100);
                    return (
                      <div key={w.week} className="flex min-h-0 min-w-0 flex-1 flex-col justify-end">
                        <div
                          className="mx-auto w-full max-w-[2.5rem] rounded-t-sm bg-gradient-to-t from-amber-900/45 to-amber-500/35"
                          style={{ height: `${pct}%`, minHeight: "0.45rem" }}
                          title={`${formatIsoWeekTooltipPrefix(w.week)} · ${w.count} messages logged`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-1.5 flex gap-1 sm:gap-2">
                  {volumeWeeks.map((w) => (
                    <div key={`${w.week}-lbl`} className="min-w-0 flex-1">
                      <span className="block whitespace-nowrap text-center font-mono text-[8px] text-[var(--rm-text-muted)]">
                        {w.shortLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
