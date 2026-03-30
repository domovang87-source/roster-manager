"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, ChevronUp, CircleHelp, X } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import { useProStatus } from "../../../lib/use-pro-status";
import { FREE_MESSAGE_LOG_CAP } from "../../../lib/free-tier";
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

export default function PulsePage() {
  const config = getSupabaseConfig();
  const { isPro, checked, accountTier } = useProStatus();
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

  React.useEffect(() => {
    if (!stackInfoOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStackInfoOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stackInfoOpen]);

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
      const ac = countRes.count ?? 0;
      if (checked && !isPro && ac >= FREE_MESSAGE_LOG_CAP) {
        setBrief(
          "You’ve hit the free log cap. Upgrade for unlimited logging and this briefing on every visit."
        );
      } else if (prospects.length === 0 || (countRes.count ?? 0) === 0) {
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
  }, [checked, isPro]);

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
            Who you&apos;ve put on your roster, whether you&apos;re keeping up, and how much you&apos;re logging.
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
                A / B / C is how you rank contact with them; <strong className="text-[var(--rm-text)]">Style</strong> is how
                often you mean to check in — C-tier might be a monthly rhythm for your parents, A-tier might be
                daily. Add them under <strong className="text-[var(--rm-text)]">People</strong>, log threads under{" "}
                <strong className="text-[var(--rm-text)]">Texts</strong> (screenshot or type), and use{" "}
                <strong className="text-[var(--rm-text)]">Home</strong> when you want drafting help.
              </p>
              <p>
                <strong className="text-[var(--rm-text)]">Roster</strong> = only who you choose — not your whole
                contacts app, not “the world.”
              </p>
              <p>
                <strong className="text-[var(--rm-text)]">Not for:</strong> birthdays, a shared calendar, or a
                generic CRM. No b-day fields, no calendar sync — roster, logs, social score, and AI where it helps.
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
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">
                Social score · roster
              </p>
              <button
                type="button"
                onClick={() => setSocialScoreExpanded((v) => !v)}
                aria-expanded={socialScoreExpanded}
                className="mt-1 flex w-full items-baseline justify-between gap-2 text-left transition hover:opacity-90"
              >
                <span className="font-mono text-3xl font-semibold tabular-nums text-amber-200/95">
                  {avgScore}
                  <span className="ml-1 text-lg font-normal text-[var(--rm-text-muted)]">/100</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                  {socialScoreExpanded ? (
                    <>
                      Hide <ChevronUp size={14} strokeWidth={1.5} className="text-amber-200/80" />
                    </>
                  ) : (
                    <>
                      What is this? <ChevronDown size={14} strokeWidth={1.5} className="text-amber-200/80" />
                    </>
                  )}
                </span>
              </button>
              {socialScoreExpanded ? (
                <div className="mt-3 space-y-3 border-t border-[var(--rm-border)] pt-3 text-sm leading-relaxed">
                  <p className="text-[var(--rm-text-muted)]">{SOCIAL_SCORE_EXPLAINER}</p>
                  <p className="text-[var(--rm-text)]">{socialSynopsis}</p>
                  <p className="text-xs text-[var(--rm-text-muted)]">
                    On <strong className="text-[var(--rm-text)]">Home</strong>, tap someone&apos;s number for that
                    person only.
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--rm-text-muted)]">
                  Tap the score for what it means and your read right now.
                </p>
              )}
            </div>
            <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">On your roster</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-[var(--rm-text)]">{rosterTotal}</p>
              <p className="mt-1 text-xs text-[var(--rm-text-muted)]">
                People you added · A {tierCounts.A} · B {tierCounts.B} · C {tierCounts.C}
              </p>
            </div>
            <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">Texts logged (7d)</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-[var(--rm-text)]">{msgs7d}</p>
              <p className="mt-1 text-xs text-[var(--rm-text-muted)]">{activityCount} all-time rows</p>
            </div>
            <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
              <p className="text-[10px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">A-list open loops</p>
              <p className="mt-1 font-mono text-3xl font-semibold tabular-nums text-amber-400/95">{aListWaiting}</p>
              <p className="mt-1 text-xs text-[var(--rm-text-muted)]">They texted last · you haven&apos;t replied</p>
            </div>
          </section>

          <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Volume</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Messages logged per week</h2>
            <p className="mt-1 text-xs text-[var(--rm-text-muted)]">
              Last ~8 weeks from your Texts tab. Each bar is one calendar week (Mon–Sun). The label under the bar
              is that week&apos;s <strong className="text-[var(--rm-text)]/90">Monday</strong> (e.g. Mar 17) so you
              can line it up with a real calendar.
            </p>
            {volumeWeeks.length === 0 ? (
              <p className="mt-6 text-sm text-[var(--rm-text-muted)]">No data in this window yet.</p>
            ) : (
              <div className="mt-6 flex h-44 gap-1 sm:gap-2">
                {volumeWeeks.map((w) => {
                  const pct = Math.max(8, (w.count / maxVol) * 100);
                  return (
                    <div key={w.week} className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className="flex min-h-0 flex-1 flex-col justify-end rounded-b-sm bg-[var(--rm-bg)]/80">
                        <div
                          className="mx-auto w-full max-w-[2.75rem] rounded-t-sm bg-gradient-to-t from-amber-900/50 to-amber-500/40"
                          style={{ height: `${pct}%`, minHeight: "0.5rem" }}
                          title={`${formatIsoWeekTooltipPrefix(w.week)} · ${w.count} messages logged`}
                        />
                      </div>
                      <span className="mt-2 block text-center font-mono text-[9px] text-[var(--rm-text-muted)]">
                        {w.shortLabel}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Mix</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Roster by tier</h2>
            <div className="mt-4 space-y-3">
              {(["A", "B", "C"] as const).map((t) => {
                const n = tierCounts[t];
                const pct = rosterTotal > 0 ? Math.round((n / rosterTotal) * 100) : 0;
                return (
                  <div key={t}>
                    <div className="flex justify-between text-xs text-[var(--rm-text-muted)]">
                      <span>{t === "A" ? "Top picks (A)" : t === "B" ? "In the mix (B)" : "Casual (C)"}</span>
                      <span className="font-mono tabular-nums text-[var(--rm-text)]">
                        {n} ({pct}%)
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--rm-bg)]">
                      <div
                        className={`h-full rounded-full ${t === "A" ? "bg-amber-500/70" : t === "B" ? "bg-sky-500/50" : "bg-slate-500/45"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Trajectory</p>
            <h2 className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Social score over time</h2>
            <p className="mt-1 text-xs leading-snug text-[var(--rm-text-muted)]">
              We snapshot this roster-wide number when you open Pulse so you can see if you&apos;re keeping up better
              week over week — same definition as the card above. Each bar is one calendar week; the label is that
              week&apos;s <strong className="text-[var(--rm-text)]/90">Monday date</strong>.
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
                          title={`${formatIsoWeekTooltipPrefix(h.week)} · social score ${h.avg} / 100`}
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

          <section className="border border-amber-500/25 bg-amber-500/[0.06] p-4 sm:p-6">
            <p className="text-[10px] uppercase tracking-[0.35em] text-amber-200/80">Briefing</p>
            <h2 className="mt-1 text-base font-semibold text-[var(--rm-text)]">What to focus on</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--rm-text-muted)]">
              {briefLoading ? "Loading…" : brief}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
