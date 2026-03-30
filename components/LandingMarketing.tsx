"use client";

import Link from "next/link";
import { CircleUserRound, Wand2 } from "lucide-react";

const VOLUME_CHART_MOCK = [
  { pct: 50, label: "Feb 3" },
  { pct: 74, label: "Feb 10" },
  { pct: 68, label: "Feb 17" },
  { pct: 100, label: "Feb 24" },
  { pct: 79, label: "Mar 3" },
  { pct: 88, label: "Mar 10" },
  { pct: 64, label: "Mar 17" },
  { pct: 97, label: "Mar 24" },
] as const;

/** Single-scroll marketing teaser: same hero as login, Pulse + draft mocks, CTA to sign up. */
export default function LandingMarketing() {
  return (
    <div className="min-h-screen bg-[var(--rm-bg)] text-[var(--rm-text)]">
      <div className="sticky top-0 z-20 border-b border-[color:var(--rm-border)]/70 bg-[var(--rm-bg)]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-end px-4 py-3 sm:px-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--rm-border)] bg-[var(--rm-bg-elevated)]/90 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-accent-muted)]/50 hover:text-[var(--rm-text)]"
            aria-label="Sign in to your account"
          >
            <CircleUserRound size={18} strokeWidth={1.5} className="text-[var(--rm-text-muted)]" aria-hidden />
            <span>Sign in</span>
          </Link>
        </div>
      </div>
      <header className="mx-auto max-w-3xl px-6 pb-16 pt-10 text-center sm:pt-16">
        <h1 className="text-5xl font-light tracking-[0.5em] sm:text-6xl">STACK</h1>
        <p className="mt-5 font-light italic tracking-[0.15em] text-[var(--rm-text-muted)]">
          Your circle, curated.
        </p>
        <p className="mx-auto mt-8 max-w-md text-sm leading-relaxed text-[var(--rm-text-muted)]">
          The AI-powered CRM for your social life. Track Charisma Scores, draft the perfect reply, and never let an
          important thread slip through the cracks again.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login?mode=signup"
            className="inline-flex w-full max-w-xs items-center justify-center rounded-full bg-[var(--rm-accent)] px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.28em] text-white shadow-[0_0_24px_rgba(184,62,125,0.25)] transition hover:brightness-110 sm:w-auto"
          >
            Get Stack free
          </Link>
          <Link
            href="/login"
            className="text-[12px] font-medium tracking-[0.08em] text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-20" aria-labelledby="pulse-preview-heading">
        <p
          id="pulse-preview-heading"
          className="text-center text-[10px] uppercase tracking-[0.4em] text-[var(--rm-text-muted)]"
        >
          Pulse · command center
        </p>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[var(--rm-text-muted)]">
          Organize the chaos of your DMs — Charisma Scores, weekly volume, and who still needs you. See who&apos;s
          matching your effort.
        </p>
        <div className="mt-8 overflow-hidden rounded-sm border border-[color:var(--rm-border)] bg-[var(--rm-bg-elevated)] shadow-[0_0_0_1px_rgba(184,62,125,0.06)]">
          <div className="border-b border-[color:var(--rm-border)] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Pulse</p>
            <p className="mt-1 text-sm font-semibold text-[var(--rm-text)]">Filter the noise — know where you stand</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="border border-[color:var(--rm-accent-muted)]/35 bg-[var(--rm-accent)]/[0.07] p-3">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[var(--rm-accent)]">Charisma Score · roster</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[var(--rm-text)]">
                72<span className="ml-1 text-base font-normal text-[var(--rm-text-muted)]">/100</span>
              </p>
              <p className="mt-1 text-[10px] text-[var(--rm-text-muted)]">Tap to see why you have this score</p>
            </div>
            <div className="border border-[color:var(--rm-border)] bg-[var(--rm-bg)] p-3">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">On your roster</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">12</p>
              <p className="mt-1 text-[10px] text-[var(--rm-text-muted)]">A inner circle · B in the mix · C check-ins</p>
            </div>
            <div className="border border-[color:var(--rm-border)] bg-[var(--rm-bg)] p-3">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">Texts logged (7d)</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">38</p>
            </div>
            <div className="border border-[color:var(--rm-border)] bg-[var(--rm-bg)] p-3">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">Priority open loops</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[var(--rm-accent)]">1</p>
              <p className="mt-1 text-[10px] text-[var(--rm-text-muted)]">They reached out last · you haven&apos;t replied</p>
            </div>
          </div>
          <div className="border-t border-[color:var(--rm-border)] px-4 py-4">
            <p className="text-[9px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">Volume</p>
            <p className="mt-1 text-xs font-medium text-[var(--rm-text-muted)]">Weekly momentum — where you actually showed up</p>
            <div className="mt-4">
              <div className="flex h-36 gap-1 rounded-b-sm bg-[var(--rm-bg)]/90 sm:h-40 sm:gap-2">
                {VOLUME_CHART_MOCK.map(({ pct }, i) => (
                  <div key={i} className="flex min-h-0 min-w-0 flex-1 flex-col justify-end">
                    <div
                      className="mx-auto w-full max-w-[2.5rem] rounded-t-sm bg-gradient-to-t from-[var(--rm-accent-deep)] to-[var(--rm-accent)] shadow-[0_-1px_12px_rgba(184,62,125,0.2)]"
                      style={{ height: `${Math.max(12, pct)}%`, minHeight: "0.75rem" }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1 sm:gap-2">
                {VOLUME_CHART_MOCK.map(({ label }, i) => (
                  <div key={`lbl-${i}`} className="min-w-0 flex-1">
                    <span className="block whitespace-nowrap text-center font-mono text-[8px] text-[var(--rm-text-muted)] sm:text-[9px]">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-20" aria-labelledby="active-charisma-read-heading">
        <p
          id="active-charisma-read-heading"
          className="text-center text-[10px] uppercase tracking-[0.4em] text-[var(--rm-text-muted)]"
        >
          Home · thread read
        </p>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[var(--rm-text-muted)]">
          Filter the noise — tap the Charisma Score on any card. Stack reads the vibe and momentum of the thread in plain
          language.
        </p>
        <div className="mt-8 overflow-hidden rounded-sm border border-[color:var(--rm-border)] bg-[var(--rm-bg)] shadow-[inset_0_1px_0_rgba(184,62,125,0.05)]">
          <div className="border-b border-[color:var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-2">
            <p className="text-[9px] uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">Sample screenshot · not your data</p>
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--rm-border)]/80 pb-3">
              <div>
                <p className="text-sm font-semibold text-[var(--rm-text)]">Aubrey</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.25em] text-[var(--rm-text-muted)]">A-Tier · inner circle</p>
              </div>
              <div className="flex max-w-[10.5rem] items-center gap-1.5 rounded-full border border-[color:var(--rm-accent-muted)]/45 bg-[var(--rm-bg-elevated)] px-2 py-1 text-left ring-1 ring-[var(--rm-accent)]/15">
                <Wand2 size={12} strokeWidth={1.5} className="shrink-0 text-[var(--rm-accent)]" aria-hidden />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[12px] font-semibold tabular-nums leading-none text-[var(--rm-text)]">76</span>
                  <span className="line-clamp-2 text-[8px] font-medium leading-snug text-[var(--rm-text-muted)]">
                    They texted last · tap
                  </span>
                </span>
              </div>
            </div>
            <div
              className="mt-3 border border-[color:var(--rm-accent-muted)]/35 bg-[var(--rm-bg-elevated)] p-3 text-left shadow-lg"
              role="img"
              aria-label="Example Charisma Score explanation popover"
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--rm-accent)]">
                Charisma Score · 76/100 · A-Tier
              </p>
              <div className="mt-2 space-y-2.5 text-[11px] leading-snug text-[var(--rm-text-muted)]">
                <p className="text-[var(--rm-text)]">
                  <span className="font-medium text-[var(--rm-text)]">76/100</span> — they texted last about 18 hours ago.
                </p>
                <p>
                  You&apos;re nearing the ~24-hour check-in pace you set — reply when you mean it, not when you panic.
                </p>
                <p className="text-[var(--rm-text)]">
                  <span className="font-semibold text-[var(--rm-accent)]">Next step:</span> Send one text that answers
                  what they sent and moves the thread forward (time, place, or a clear ask). Do it before you blow past
                  your own pace. After you send, log it under <span className="text-[var(--rm-text-muted)]">Texts</span>{" "}
                  so your read stays accurate.
                </p>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-[var(--rm-text-muted)]">
              In the app, tap the score — same clarity on your real threads, not a demo fantasy.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-24" aria-labelledby="draft-preview-heading">
        <p
          id="draft-preview-heading"
          className="text-center text-[10px] uppercase tracking-[0.4em] text-[#6b7280]"
        >
          Home · A-tier draft
        </p>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[#9aa1ae]">
          They texted — you freeze on what to say. Stack pulls from your log and the voice you set per person, so you get
          something you can send, not a blank screen.
        </p>
        <div className="mt-8 border border-[#2a2e36] bg-[#12161c] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2a2e36]/80 pb-3">
            <div>
              <p className="text-sm font-semibold text-[#e8eaef]">Raven</p>
              <p className="mt-0.5 text-[9px] uppercase tracking-[0.25em] text-[#6b7280]">A-Tier</p>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-amber-500/45 px-2 py-1 text-amber-100/95">
              <span className="text-[11px] font-semibold tabular-nums">78</span>
              <span className="max-w-[5.5rem] text-[7px] font-medium leading-tight text-[#a8adb8]">
                Looks steady · tap
              </span>
            </div>
          </div>
          <p className="mt-3 text-[11px] leading-snug text-[var(--rm-text-muted)]">
            &ldquo;Haha okay - let&apos;s do Thursday.&rdquo;
          </p>
          <div className="mt-4 border border-[color:var(--rm-border)] bg-[var(--rm-bg)] p-3">
            <p className="text-[9px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">Suggested reply</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--rm-text)]">
              Let&apos;s do Sushi at 7; I&apos;ll grab us a spot and text you the place.
            </p>
          </div>
          <p className="mt-3 text-[10px] text-[var(--rm-text-muted)]">
            Sample only — your drafts are built from what you actually logged, not generic lines.
          </p>
        </div>
      </section>

      <footer className="mx-auto max-w-3xl px-6 pb-16 text-center">
        <Link
          href="/login?mode=signup"
          className="inline-flex w-full max-w-sm items-center justify-center rounded-full border border-[color:var(--rm-accent)] bg-transparent px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--rm-text)] transition hover:bg-[var(--rm-accent)] hover:text-white sm:w-auto"
        >
          Get Stack free
        </Link>
        <p className="mt-6 max-w-sm mx-auto text-[11px] leading-relaxed text-[var(--rm-text-muted)]">
          Free to start · roster + Texts log + one AI draft. Curate your circle, manage the chaos, upgrade when it&apos;s
          earning its keep.
        </p>
      </footer>
    </div>
  );
}
