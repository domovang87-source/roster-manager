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
  /** C-tier 7d activity exceeds every A-tier person’s 7d activity (and you have at least one A). */
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
  const [stackInfoOpen, setStackInfoOpen] = React.useState(false);
  const [truthMirrorOpen, setTruthMirrorOpen] = React.useState(false);
  const [allocationTop5, setAllocationTop5] = React.useState<AllocationRow[]>([]);
  const [socialEquityRows, setSocialEquityRows] = React.useState<SocialEquityRow[]>([]);
  const [socialEquityRows7d, setSocialEquityRows7d] = React.useState<SocialEquityRow[]>([]);
  const [briefTacticalServer, setBriefTacticalServer] = React.useState<string[]>([]);
  const [pulseTacticalClient, setPulseTacticalClient] = React.useState<string[]>([]);

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

    // Briefing (same rules as Home used to use)
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
      setBrief("Couldn’t load briefing. Try again in a moment.");
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
  const mergedTacticalNotes = React.useMemo(
    () => [...new Set([...briefTacticalServer, ...pulseTacticalClient])],
    [briefTacticalServer, pulseTacticalClient]
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
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-[var(--rm-alert)]/90">Pulse · ops</p>
          <h1 className="mt-1 border-l-2 border-[var(--rm-alert)]/55 pl-3 text-2xl font-semibold tracking-tight text-[var(--rm-text)] sm:text-3xl">
            Command center
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
          <p className="mt-2 max-w-md text-xs text-[var(--rm-text-muted)]">
            Roster momentum · open loops · who&apos;s thin vs loud in the log.
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
            <div className="mt-4 space-y-2 text-sm leading-snug text-[var(--rm-text-muted)]">
              <p>
                <strong className="text-[var(--rm-text)]">Stack:</strong> rank people A/B/C, set check-in rhythm, log threads
                under <strong className="text-[var(--rm-text)]">Texts</strong>, draft on <strong className="text-[var(--rm-text)]">Home</strong>.
              </p>
              <p>
                Your roster only — not your whole address book. Data on attention and reciprocity from what you log, not
                a generic CRM.
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
            <div className="mt-4 space-y-2 text-sm leading-snug text-[var(--rm-text-muted)]">
              <p>
                If <strong className="text-amber-200/90">C-tier</strong> eats more of your logs than{" "}
                <strong className="text-amber-400/95">A-tier</strong>, your allocation is inverted — power follows focus.
              </p>
              <p className="border-l-2 border-amber-500/50 pl-3 text-[var(--rm-text)] text-xs">
                Feed who you said matters. Honest only to the extent your Texts log is.
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
                <div className="mt-4 space-y-2 border-t border-[var(--rm-border)] pt-4 text-xs leading-snug">
                  <p className="text-[var(--rm-text-muted)]">{SOCIAL_SCORE_EXPLAINER}</p>
                  <p className="text-[var(--rm-text)]">{socialSynopsis}</p>
                  <p className="text-[var(--rm-text-muted)]">
                    <strong className="text-[var(--rm-text)]">Home:</strong> tap the score for one person.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-5 lg:p-6">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">
                Quick counts · reference
              </p>
              <p className="mt-1 text-[10px] text-[var(--rm-text-muted)]">At a glance.</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md border border-[var(--rm-border)]/70 bg-[var(--rm-bg)]/40 px-3 py-3">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--rm-text-muted)]">Needs reply</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-400/95 sm:text-3xl">
                    {aListWaiting}
                  </p>
                  <p className="mt-1 text-[9px] leading-snug text-[var(--rm-text-muted)]">A-list · they texted last</p>
                </div>
                <div className="rounded-md border border-[var(--rm-border)]/70 bg-[var(--rm-bg)]/40 px-3 py-3">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--rm-text-muted)]">Roster</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--rm-text)] sm:text-3xl">
                    {rosterTotal}
                  </p>
                  <p className="mt-1 font-mono text-[9px] tabular-nums text-[var(--rm-text-muted)]">
                    A{tierCounts.A} · B{tierCounts.B} · C{tierCounts.C}
                  </p>
                </div>
                <div className="rounded-md border border-[var(--rm-border)]/70 bg-[var(--rm-bg)]/40 px-3 py-3">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--rm-text-muted)]">Logs · 7 days</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--rm-text)] sm:text-3xl">
                    {msgs7d}
                  </p>
                  <p className="mt-1 text-[9px] text-[var(--rm-text-muted)]">Rows logged this week</p>
                </div>
                <div className="rounded-md border border-[var(--rm-border)]/70 bg-[var(--rm-bg)]/40 px-3 py-3">
                  <p className="text-[9px] uppercase tracking-[0.18em] text-[var(--rm-text-muted)]">All-time logs</p>
                  <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--rm-text)] sm:text-3xl">
                    {activityCount}
                  </p>
                  <p className="mt-1 text-[9px] text-[var(--rm-text-muted)]">Total message rows</p>
                </div>
              </div>
              {hasEnergyLeak ? (
                <p className="mt-4 flex items-start gap-2 border-t border-amber-500/30 pt-3 text-[11px] leading-snug text-amber-100/90">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400/95" strokeWidth={2} aria-hidden />
                  <span>
                    Someone not A-tier logged more texts / engagement this week than your busiest A — see charts below.
                  </span>
                </p>
              ) : null}
            </div>
          </section>

          <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Truth mirror</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Energy allocation</h2>
            <p className="mt-1 text-[10px] text-[var(--rm-text-muted)]">
              Rank vs last 7 days of logs. Tap a slice → People. Tap card → details.
            </p>
            <button
              type="button"
              onClick={() => setTruthMirrorOpen(true)}
              className="mt-5 w-full cursor-pointer rounded-sm border border-[var(--rm-border)] bg-[var(--rm-bg)]/50 p-4 text-left transition hover:border-amber-500/35 hover:bg-[var(--rm-bg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500/40 sm:p-5"
            >
              <div className="grid gap-8 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-center sm:gap-8">
                <div className="flex w-full min-w-0 flex-col items-center sm:items-start">
                  <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--rm-text-muted)]">Roster</p>
                  <p className="mt-1 text-[11px] font-medium text-[var(--rm-text)]">By tier</p>
                  {rosterTotal === 0 ? (
                    <p className="mt-4 text-xs text-[var(--rm-text-muted)]">No people yet</p>
                  ) : (
                    <div className="mt-3 w-full">
                      <RosterTierPie tierCounts={tierCounts} tierLinks />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.22em] text-[var(--rm-text-muted)]">Attention</p>
                  <p className="mt-1 text-[11px] font-medium text-[var(--rm-text)]">Top 5 · 7 days</p>
                  {allocationTop5.length === 0 || allocationTop5.every((r) => r.count7d === 0) ? (
                    <p className="mt-4 text-xs text-[var(--rm-text-muted)]">Nothing logged in 7d — add Texts.</p>
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
                                    className="h-3.5 w-3.5 shrink-0 text-amber-400/95"
                                    strokeWidth={2}
                                    aria-label="Energy leak: more texts and engagement logged in 7d than your busiest A-tier"
                                  />
                                ) : null}
                                <span className="truncate font-medium">{row.name}</span>
                                {row.leak ? (
                                  <span className="shrink-0 text-[8px] font-semibold uppercase tracking-[0.1em] text-amber-300/90">
                                    ⚠ Energy leak
                                  </span>
                                ) : null}
                                <span className="shrink-0 font-mono text-[9px] text-[var(--rm-text-muted)]">
                                  {row.tier}
                                </span>
                              </span>
                              <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text-muted)]">
                                {row.count7d}
                              </span>
                            </div>
                            <div
                              className={`mt-1 h-2 overflow-hidden rounded-sm bg-[var(--rm-bg)] ${row.leak ? "ring-1 ring-amber-500/50" : ""}`}
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
              <p className="mt-4 text-center text-[9px] uppercase tracking-[0.18em] text-[var(--rm-text-muted)]">
                Tap for details
              </p>
            </button>
          </section>

          <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5 shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
            <p className="text-[10px] uppercase tracking-[0.32em] text-amber-200/75">Truth mirror · equity</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Social equity</h2>
            <p className="mt-1 text-[10px] text-[var(--rm-text-muted)]">
              <span className="text-violet-300/90">Violet</span> = their texts · <span className="text-amber-400/85">amber</span> = your texts / engagement · tag ={" "}
              <span className="text-[var(--rm-text)]">their read</span> (from the ledger).
            </p>
            <SocialEquityPanel rows={socialEquityRows} rows7d={socialEquityRows7d} />
          </section>

          <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Trajectory</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Are you improving?</h2>
            <p className="mt-1 text-[10px] text-[var(--rm-text-muted)]">Roster score by week (labels = Mondays).</p>
            {avgHistory.length === 0 ? (
              <p className="mt-6 text-xs text-[var(--rm-text-muted)]">Open Pulse a few times to see a trend.</p>
            ) : (
              <div className="mt-6 flex h-44 gap-1 sm:gap-2">
                {avgHistory.map((h) => {
                  const pct = Math.max(8, (h.avg / maxAvgHist) * 100);
                  return (
                    <div key={h.week} className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex min-h-0 flex-1 flex-col justify-end rounded-b-sm bg-[var(--rm-bg)]/80">
                        <div
                          className="mx-auto w-full max-w-[2.75rem] rounded-t-sm bg-gradient-to-t from-violet-950/55 to-violet-400/40 shadow-[0_-2px_16px_rgba(139,92,246,0.12)]"
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

          <details className="group border border-[var(--rm-border)]/80 bg-[var(--rm-bg-elevated)]/60 p-4 sm:p-5">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Reference only</p>
                  <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Weekly message volume</h2>
                  <p className="mt-1 text-[10px] text-[var(--rm-text-muted)]">Extra: ~8 weeks of how much you logged.</p>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)] group-open:hidden">
                  Show
                </span>
              </div>
            </summary>
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
          </details>

          <section className="border border-amber-500/35 bg-amber-950/[0.12] p-4 shadow-[0_0_0_1px_rgba(251,191,36,0.08)] sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.35em] text-amber-200/85">Straight talk</p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-[var(--rm-text)]">What’s actually going on</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--rm-text-muted)]">
              {briefLoading ? "Loading…" : brief}
            </p>
            {!briefLoading && mergedTacticalNotes.length > 0 ? (
              <div className="mt-4 space-y-2 border-t border-amber-500/25 pt-4">
                <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-amber-300/90">Worth a look</p>
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
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}
