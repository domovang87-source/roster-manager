"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, X } from "lucide-react";
import type { SocialEquityRow } from "@/lib/portfolio-stats";
import type { Tier } from "@/lib/roster-portfolio-compute";
import {
  SOCIAL_EQUITY_STYLE_GLOSSARY,
  SOCIAL_EQUITY_STYLE_INTRO,
} from "@/lib/social-equity-style-glossary";

function SocialEquityStyleInfo() {
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--rm-border)]/80 text-[var(--rm-text-muted)] transition hover:border-amber-500/40 hover:bg-amber-500/5 hover:text-amber-200/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500/40"
        aria-label="What do their-read tags mean?"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Info size={14} strokeWidth={1.75} aria-hidden />
      </button>
      {open ? (
        <div className="fixed inset-0 z-[130] flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="social-equity-style-title"
            className="relative z-[1] max-h-[min(85dvh,32rem)] w-full max-w-md overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-5 shadow-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="social-equity-style-title"
                className="text-sm font-semibold tracking-tight text-[var(--rm-text)]"
              >
                Their read
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full p-1 text-[var(--rm-text-muted)] transition hover:bg-[var(--rm-bg)] hover:text-[var(--rm-text)]"
                aria-label="Close"
              >
                <X size={18} strokeWidth={1.5} />
              </button>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--rm-text-muted)]">{SOCIAL_EQUITY_STYLE_INTRO}</p>
            <dl className="mt-4 space-y-3 border-t border-[var(--rm-border)]/60 pt-4">
              {SOCIAL_EQUITY_STYLE_GLOSSARY.map(({ title, body }) => (
                <div key={title}>
                  <dt className="text-[11px] font-semibold text-[var(--rm-text)]">{title}</dt>
                  <dd className="mt-0.5 text-[11px] leading-snug text-[var(--rm-text-muted)]">{body}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-5 w-full rounded-md border border-[var(--rm-border)] py-2 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)]/50 hover:text-[var(--rm-text)]"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

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
] as const;

/** Subtle wedge separators so multi-person tiers don’t read as one blob */
const PIE_WEDGE_STROKE = "rgba(255,255,255,0.16)";
const PIE_WEDGE_STROKE_WIDTH = 0.95;

export function SocialEquityPanel({
  rows,
  rows7d,
}: {
  rows: SocialEquityRow[];
  /** When set, shows a Last 7 days / All logged toggle (defaults to 7d). */
  rows7d?: SocialEquityRow[];
}) {
  const [win, setWin] = React.useState<"7d" | "all">("7d");
  const has7d = Boolean(rows7d);
  const data = has7d && win === "7d" ? (rows7d as SocialEquityRow[]) : rows;
  const active = data.filter((r) => r.inbound + r.outbound > 0);
  if (active.length === 0 && (!has7d || win === "all")) {
    return (
      <div className="mt-4 space-y-2">
        <div className="flex justify-end">
          <SocialEquityStyleInfo />
        </div>
        <p className="text-[11px] leading-snug text-[var(--rm-text-muted)]">
          Log <strong className="text-[var(--rm-text)]">Texts</strong> with direction. Tap <strong className="text-[var(--rm-text)]">i</strong> for tags.
        </p>
      </div>
    );
  }
  if (active.length === 0 && has7d && win === "7d") {
    return (
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setWin("7d")}
            className="rounded-full border border-amber-500/50 bg-amber-500/10 px-3 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-amber-100/95 transition"
          >
            Last 7 days
          </button>
          <button
            type="button"
            onClick={() => setWin("all")}
            className="rounded-full border border-[var(--rm-border)] px-3 py-1 text-[9px] font-medium uppercase tracking-[0.14em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)]/50"
          >
            All logged
          </button>
        </div>
        <SocialEquityStyleInfo />
        </div>
        <p className="text-[11px] leading-snug text-[var(--rm-text-muted)]">
          No texts in 7d — try <strong className="text-[var(--rm-text)]">All logged</strong> or log <strong className="text-[var(--rm-text)]">Texts</strong>.
        </p>
      </div>
    );
  }
  return (
    <div className="mt-4 space-y-3">
      {has7d ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWin("7d")}
              className={`rounded-full border px-3 py-1 text-[9px] font-medium uppercase tracking-[0.14em] transition ${
                win === "7d"
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-100/95"
                  : "border-[var(--rm-border)] text-[var(--rm-text-muted)] hover:border-[var(--rm-text-muted)]/50"
              }`}
            >
              Last 7 days
            </button>
            <button
              type="button"
              onClick={() => setWin("all")}
              className={`rounded-full border px-3 py-1 text-[9px] font-medium uppercase tracking-[0.14em] transition ${
                win === "all"
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-100/95"
                  : "border-[var(--rm-border)] text-[var(--rm-text-muted)] hover:border-[var(--rm-text-muted)]/50"
              }`}
            >
              All logged
            </button>
          </div>
          <div className="flex items-center gap-2">
            <SocialEquityStyleInfo />
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <SocialEquityStyleInfo />
        </div>
      )}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9px] text-[var(--rm-text-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-violet-500/75" aria-hidden />
          Their texts
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 shrink-0 rounded-[1px] bg-amber-500/60" aria-hidden />
          Your texts / engagement
        </span>
        <span className="text-[var(--rm-text-muted)]/90">Name · tier · their read</span>
      </p>
      <ul className="divide-y divide-[var(--rm-border)]/35">
        {active.map((r) => {
          const sum = r.inbound + r.outbound;
          const ibPct = sum ? (r.inbound / sum) * 100 : 50;
          const tierDot =
            r.tier === "A" ? "text-amber-400" : r.tier === "B" ? "text-sky-400/90" : "text-slate-400";
          return (
            <li
              key={r.id}
              className={`py-3 first:pt-2 ${r.energyLeak ? "border-l-2 border-amber-500/55 pl-2.5 -ml-0.5" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                <div className="min-w-0">
                  <p className="text-[8px] font-medium uppercase tracking-[0.12em] text-[var(--rm-text-muted)]">Contact</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] font-semibold tracking-tight text-[var(--rm-text)]">
                    <span className={`shrink-0 font-mono text-[10px] font-bold ${tierDot}`}>{r.tier}</span>
                    <span className="truncate">{r.name}</span>
                    {r.energyLeak ? (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-amber-200/95">
                        Energy leak
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[8px] font-medium uppercase tracking-[0.12em] text-[var(--rm-text-muted)]">Their read</p>
                  <p
                    className="mt-0.5 text-[11px] font-medium text-[var(--rm-text)]"
                    title="Their side of the thread in your log — asymmetry, not mind-reading. Tap i for definitions."
                  >
                    {r.styleLabel}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex h-2 overflow-hidden rounded-full bg-black/30 ring-1 ring-violet-500/20">
                <div
                  className="h-full bg-gradient-to-b from-violet-400/80 to-violet-600/55"
                  style={{ width: `${ibPct}%` }}
                  title={`Their texts · ${r.inbound} logged`}
                />
                <div
                  className="h-full bg-gradient-to-b from-amber-400/65 to-amber-600/45"
                  style={{ width: `${100 - ibPct}%` }}
                  title={`Your texts / engagement · ${r.outbound} logged`}
                />
              </div>
              <div className="mt-1.5 flex justify-between gap-2 font-mono text-[9px] tabular-nums text-[var(--rm-text-muted)]">
                <span>
                  Their texts <span className="text-violet-300/90">{r.inbound}</span>
                </span>
                <span className="max-w-[40%] text-center text-[var(--rm-text-muted)]/90 leading-tight">
                  {r.outboundPct}% yours
                </span>
                <span className="text-right">
                  Yours <span className="text-amber-400/85">{r.outbound}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RosterTierPie({
  tierCounts,
  tierLinks = false,
}: {
  tierCounts: Record<Tier, number>;
  /** Tap a wedge or legend row → People with that tier highlighted */
  tierLinks?: boolean;
}) {
  const router = useRouter();
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
            stroke={PIE_WEDGE_STROKE}
            strokeWidth={PIE_WEDGE_STROKE_WIDTH}
            vectorEffect="non-scaling-stroke"
            className={tierLinks ? "cursor-pointer" : undefined}
            onClick={
              tierLinks
                ? (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/roster?tier=${only.key}`);
                  }
                : undefined
            }
            role={tierLinks ? "link" : undefined}
            aria-label={tierLinks ? `Open ${only.label} on People` : undefined}
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
            {tierLinks ? (
              <Link
                href={`/roster?tier=${only.key}`}
                onClick={(e) => e.stopPropagation()}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 transition hover:opacity-90"
              >
                <span className="flex min-w-0 items-center gap-2 text-[var(--rm-text-muted)]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${only.dot}`} aria-hidden />
                  <span className="truncate">{only.label}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text)]">{only.n}</span>
              </Link>
            ) : (
              <>
                <span className="flex min-w-0 items-center gap-2 text-[var(--rm-text-muted)]">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${only.dot}`} aria-hidden />
                  <span className="truncate">{only.label}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text)]">{only.n}</span>
              </>
            )}
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
          {pieces.map((pc) => (
            <path
              key={pc.key}
              d={pc.d}
              fill={pc.fill}
              stroke={PIE_WEDGE_STROKE}
              strokeWidth={PIE_WEDGE_STROKE_WIDTH}
              vectorEffect="non-scaling-stroke"
              className={tierLinks ? "cursor-pointer transition hover:brightness-110" : undefined}
              onClick={
                tierLinks
                  ? (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(`/roster?tier=${pc.key}`);
                    }
                  : undefined
              }
              role={tierLinks ? "link" : undefined}
              aria-label={tierLinks ? `Open ${pc.key}-tier people` : undefined}
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
              {tierLinks ? (
                <Link
                  href={`/roster?tier=${m.key}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex min-w-0 flex-1 items-center justify-between gap-3 transition hover:opacity-90"
                >
                  <span className="flex min-w-0 items-center gap-2 text-[var(--rm-text-muted)]">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} aria-hidden />
                    <span className="truncate">{m.label}</span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text)]">{n}</span>
                </Link>
              ) : (
                <>
                  <span className="flex min-w-0 items-center gap-2 text-[var(--rm-text-muted)]">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${m.dot}`} aria-hidden />
                    <span className="truncate">{m.label}</span>
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-[var(--rm-text)]">{n}</span>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
