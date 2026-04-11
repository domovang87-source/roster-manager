"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ChevronDown, ChevronUp, Users } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import { useProStatus } from "../../../lib/use-pro-status";
import {
  buildProspectMomentumStateMap,
  coerceTier,
  remindByTierFromRulesRows,
  type Tier,
} from "../../../lib/roster-portfolio-compute";
import type { PortfolioProspect, SocialEquityRow } from "../../../lib/portfolio-stats";
import { averagePortfolioMomentum, buildSocialEquityRows, isAtGhostingRisk } from "../../../lib/portfolio-stats";
import { buildPulseTacticalNotes } from "../../../lib/pulse-tactical-audit";
import { buildSocialScoreSynopsis, SOCIAL_SCORE_EXPLAINER } from "../../../lib/social-score-narrative";
import { getIsoWeekKeyLocal } from "../../../lib/portfolio-week-storage";
import { messagesVolumeByWeek } from "../../../lib/pulse-volume-by-week";
import { formatIsoWeekAxisLabel, formatIsoWeekTooltipPrefix } from "../../../lib/iso-week-label";
import { recordPulseWeekAvg, readPulseAvgHistory } from "../../../lib/pulse-avg-history";
import { RosterTierPie, SocialEquityPanel } from "../../../components/PulseRosterCharts";
import {
  buildSocialEquityRowsLast7d,
  type SocialEquityMessageRow,
} from "../../../lib/social-equity-window";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";

type ProspectRow = {
  id: string;
  name?: string | null;
  tier?: unknown;
  vibe_notes?: string | null;
};

type AllocationRow = {
  id: string;
  name: string;
  tier: Tier;
  count7d: number;
  /** C-tier 7d activity exceeds every A-tier person's 7d activity (and you have at least one A). */
  leak: boolean;
};

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
  const [allocationTop5, setAllocationTop5] = React.useState<AllocationRow[]>([]);
  const [socialEquityRows, setSocialEquityRows] = React.useState<SocialEquityRow[]>([]);
  const [socialEquityRows7d, setSocialEquityRows7d] = React.useState<SocialEquityRow[]>([]);
  const [briefTacticalServer, setBriefTacticalServer] = React.useState<string[]>([]);
  const [pulseTacticalClient, setPulseTacticalClient] = React.useState<string[]>([]);

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
      client.from("prospects").select("id,name,tier,vibe_notes"),
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

    const eqRows = buildSocialEquityRows(portfolioProspects, count7dByProspect, maxA7d, tc.A > 0);
    eqRows.sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound));
    setSocialEquityRows(eqRows.slice(0, 10));
    const eq7d = buildSocialEquityRowsLast7d(
      portfolioProspects,
      fullMessages as SocialEquityMessageRow[],
      now,
      count7dByProspect,
      maxA7d,
      tc.A > 0
    );
    eq7d.sort((a, b) => b.inbound + b.outbound - (a.inbound + a.outbound));
    setSocialEquityRows7d(eq7d.slice(0, 10));
    setPulseTacticalClient(
      buildPulseTacticalNotes(
        prospects.map((r) => ({
          id: String(r.id),
          tier: coerceTier(r.tier),
          name: (r.name as string) || "Them",
        })),
        fullMessages as { prospect_id?: string; created_at?: string; direction?: string }[]
      )
    );

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

    setBriefLoading(true);
    try {
      if (prospects.length === 0 || (countRes.count ?? 0) === 0) {
        setBrief("Add People + log Texts.");
        setBriefTacticalServer([]);
      } else {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch("/api/daily-narrative", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = (await res.json()) as { synopsis?: string; tacticalNotes?: string[] };
        setBrief(data.synopsis ?? "Nothing to add yet.");
        setBriefTacticalServer(data.tacticalNotes ?? []);
      }
    } catch {
      setBrief("Couldn't load briefing. Try again in a moment.");
      setBriefTacticalServer([]);
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

  const maxAvgHist = Math.max(100, ...avgHistory.map((h) => h.avg));
  const socialSynopsis = React.useMemo(
    () => buildSocialScoreSynopsis(avgScore, pulseProspects, activityCount),
    [avgScore, pulseProspects, activityCount]
  );
  const hasEnergyLeak = React.useMemo(
    () => allocationTop5.some((r) => r.leak),
    [allocationTop5]
  );
  const mergedTacticalNotes = React.useMemo(
    () => [...new Set([...briefTacticalServer, ...pulseTacticalClient])],
    [briefTacticalServer, pulseTacticalClient]
  );

  return (
    <div className="space-y-6 pb-4">
      {/* ── Header ── */}
      <header>
        <Link
          href="/home"
          className="label mb-3 inline-flex items-center gap-2 text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
        >
          <ArrowLeft size={14} strokeWidth={1.25} />
          Home
        </Link>
        <PageHeader
          title="Insights"
          subtitle={
            accountTier === null
              ? undefined
              : `${accountTier === "free" ? "Free" : accountTier === "pro" ? "Pro" : "Elite"} tier`
          }
        />
      </header>

      {error && (
        <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--rm-text-muted)]">Loading insights…</p>
      ) : rosterTotal === 0 ? (
        <Card as="section">
          <EmptyState
            icon={Users}
            headline="No people yet"
            body="Add someone under People first. Insights tracks what you log under Texts."
            cta={{ label: "Add a person", href: "/roster" }}
          />
        </Card>
      ) : (
        <>
          {/* ── Hero: Thread Score ── */}
          <Card as="section">
            <div>
              <p className="label text-[var(--rm-text-muted)]">Thread score</p>
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
                <span className="label flex shrink-0 items-center gap-1 text-[var(--rm-text-muted)]">
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
              <p className="mt-2 text-sm text-[var(--rm-text-muted)]">{socialSynopsis}</p>
              {socialScoreExpanded && (
                <div className="mt-4 space-y-2 border-t border-[var(--rm-border)] pt-4 text-xs leading-snug">
                  <p className="text-[var(--rm-text-muted)]">{SOCIAL_SCORE_EXPLAINER}</p>
                  <p className="text-[var(--rm-text-muted)]">
                    <strong className="text-[var(--rm-text)]">Home:</strong> tap the score for one person.
                  </p>
                </div>
              )}
            </div>
            {hasEnergyLeak && (
              <p className="mt-4 flex items-start gap-2 border-t border-amber-500/30 pt-3 text-[11px] leading-snug text-amber-100/90">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/95" strokeWidth={2} aria-hidden />
                <span>
                  Someone not A-tier logged more texts this week than your busiest A — see Balance below.
                </span>
              </p>
            )}
          </Card>

          {/* ── Briefing: always visible (most useful) ── */}
          <Card as="section" className="border-amber-500/25">
            <div>
              <p className="label text-amber-200/85">Briefing</p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-[var(--rm-text)]">
                What&apos;s actually going on
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--rm-text-muted)]">
                {briefLoading ? "Loading…" : brief}
              </p>
              {!briefLoading && mergedTacticalNotes.length > 0 && (
                <div className="mt-4 space-y-2 border-t border-amber-500/25 pt-4">
                  <p className="label text-amber-300/90">Worth a look</p>
                  <ul className="space-y-2 text-sm leading-snug text-amber-100/90">
                    {mergedTacticalNotes.map((line, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="shrink-0 text-amber-400/90" aria-hidden>
                          ▸
                        </span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          {/* ── Balance (collapsed by default) ── */}
          <details className="group rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)]">
            <summary className="cursor-pointer list-none px-4 py-4 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="label text-[var(--rm-text-muted)]">Balance</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Tier mix &amp; energy allocation</p>
                </div>
                <span className="label shrink-0 text-[var(--rm-text-muted)] group-open:hidden">Show</span>
              </div>
            </summary>
            <div className="border-t border-[var(--rm-border)] px-4 py-4 space-y-6">
              {/* Tier pie */}
              <div>
                <p className="label text-[var(--rm-text-muted)]">Roster by tier</p>
                {rosterTotal === 0 ? (
                  <p className="mt-4 text-xs text-[var(--rm-text-muted)]">No people yet</p>
                ) : (
                  <div className="mt-3">
                    <RosterTierPie tierCounts={tierCounts} tierLinks />
                  </div>
                )}
              </div>

              {/* Top-5 allocation bars */}
              <div>
                <p className="label text-[var(--rm-text-muted)]">Top 5 attention · 7 days</p>
                {allocationTop5.length === 0 || allocationTop5.every((r) => r.count7d === 0) ? (
                  <p className="mt-4 text-xs text-[var(--rm-text-muted)]">Nothing logged in 7 days — add Texts.</p>
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
                              {row.leak && (
                                <AlertTriangle
                                  className="h-3.5 w-3.5 shrink-0 text-amber-400/95"
                                  strokeWidth={2}
                                  aria-label="Energy leak: more activity in 7d than your busiest A-tier"
                                />
                              )}
                              <span className="truncate font-medium">{row.name}</span>
                              {row.leak && (
                                <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-300/90">
                                  ⚠ Leak
                                </span>
                              )}
                              <span className="shrink-0 font-mono text-[11px] text-[var(--rm-text-muted)]">
                                {row.tier}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text-muted)]">
                              {row.count7d}
                            </span>
                          </div>
                          <div
                            className={`mt-1 h-2 overflow-hidden rounded-lg bg-[var(--rm-bg)] ${row.leak ? "ring-1 ring-amber-500/50" : ""}`}
                          >
                            <div className={`h-full rounded-lg ${barCls}`} style={{ width: `${w}%` }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Social equity panel */}
              <div>
                <p className="label text-[var(--rm-text-muted)]">Balance detail</p>
                <p className="mt-1 text-xs text-[var(--rm-text-muted)]">
                  <span className="text-violet-300/90">Violet</span> = their texts ·{" "}
                  <span className="text-amber-400/85">amber</span> = yours
                </p>
                <SocialEquityPanel rows={socialEquityRows} rows7d={socialEquityRows7d} />
              </div>
            </div>
          </details>

          {/* ── Trends (collapsed by default) ── */}
          <details className="group rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)]">
            <summary className="cursor-pointer list-none px-4 py-4 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="label text-[var(--rm-text-muted)]">Trends</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Weekly score trajectory</p>
                </div>
                <span className="label shrink-0 text-[var(--rm-text-muted)] group-open:hidden">Show</span>
              </div>
            </summary>
            <div className="border-t border-[var(--rm-border)] px-4 py-4">
              {avgHistory.length === 0 ? (
                <p className="text-xs text-[var(--rm-text-muted)]">Open Insights a few times to build a trend.</p>
              ) : (
                <div className="flex h-44 gap-1 sm:gap-2">
                  {avgHistory.map((h) => {
                    const pct = Math.max(8, (h.avg / maxAvgHist) * 100);
                    return (
                      <div key={h.week} className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <div className="flex min-h-0 flex-1 flex-col justify-end rounded-b-lg bg-[var(--rm-bg)]/80">
                          <div
                            className="mx-auto w-full max-w-[2.75rem] rounded-t-lg bg-gradient-to-t from-violet-950/55 to-violet-400/40 shadow-[0_-2px_16px_rgba(139,92,246,0.12)]"
                            style={{ height: `${pct}%`, minHeight: "0.5rem" }}
                            title={`${formatIsoWeekTooltipPrefix(h.week)} · Thread Score ${h.avg} / 100`}
                          />
                        </div>
                        <span className="mt-2 block text-center font-mono text-[11px] text-[var(--rm-text-muted)]">
                          {h.shortLabel}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
