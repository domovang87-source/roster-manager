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
    <div className="min-h-screen bg-[#0b0e11] text-[#fafafa]">
      <div className="sticky top-0 z-20 border-b border-[#2a2e36]/60 bg-[#0b0e11]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-end px-4 py-3 sm:px-6">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full border border-[#2a2e36] bg-[#12161c]/90 px-3 py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-[#c8cdd6] transition hover:border-[#4b5563] hover:text-[#fafafa]"
            aria-label="Sign in to your account"
          >
            <CircleUserRound size={18} strokeWidth={1.5} className="text-[#9aa1ae]" aria-hidden />
            <span>Sign in</span>
          </Link>
        </div>
      </div>
      <header className="mx-auto max-w-3xl px-6 pb-16 pt-10 text-center sm:pt-16">
        <h1 className="text-5xl font-light tracking-[0.5em] sm:text-6xl">STACK</h1>
        <p className="mt-5 font-light italic tracking-[0.15em] text-[#a8adb8]">
          Don&apos;t mess up the follow-up. Don&apos;t forget who you meant to text.
        </p>
        <p className="mx-auto mt-8 max-w-md text-sm leading-relaxed text-[#8b929e]">
          Stack is for anyone juggling more than one thread — busy, dating, or just bad at keeping it all in your head.
          One place for who matters, what was said, and AI-backed drafts when you need the right words fast.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login?mode=signup"
            className="inline-flex w-full max-w-xs items-center justify-center rounded-full bg-[#fafafa] px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.28em] text-[#0b0e11] transition hover:opacity-90 sm:w-auto"
          >
            Get Stack free
          </Link>
          <Link
            href="/login"
            className="text-[12px] font-medium tracking-[0.08em] text-[#b4bac8] transition hover:text-[#fafafa]"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-20" aria-labelledby="pulse-preview-heading">
        <p
          id="pulse-preview-heading"
          className="text-center text-[10px] uppercase tracking-[0.4em] text-[#6b7280]"
        >
          Pulse · command center
        </p>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[#9aa1ae]">
          Where your attention is going — and where it&apos;s slipping. Active Charisma Score, weekly volume, and whether
          someone you care about is waiting on <span className="text-[#c8cdd6]">you</span>.
        </p>
        <div className="mt-8 overflow-hidden rounded-sm border border-[#2a2e36] bg-[#12161c] shadow-[0_0_0_1px_rgba(255,255,255,0.03)]">
          <div className="border-b border-[#2a2e36] px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.32em] text-[#6b7280]">Pulse</p>
            <p className="mt-1 text-sm font-semibold text-[#e8eaef]">So nothing slips while you&apos;re busy</p>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <div className="border border-amber-500/25 bg-amber-500/[0.06] p-3">
              <p className="text-[9px] uppercase tracking-[0.28em] text-amber-200/70">Active Charisma · roster</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-200/95">
                72<span className="ml-1 text-base font-normal text-[#6b7280]">/100</span>
              </p>
              <p className="mt-1 text-[10px] text-[#8b929e]">Tap to see why you have this score</p>
            </div>
            <div className="border border-[#2a2e36] bg-[#0b0e11] p-3">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[#6b7280]">On your roster</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">12</p>
              <p className="mt-1 text-[10px] text-[#8b929e]">A 3 · B 5 · C 4</p>
            </div>
            <div className="border border-[#2a2e36] bg-[#0b0e11] p-3">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[#6b7280]">Texts logged (7d)</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">38</p>
            </div>
            <div className="border border-[#2a2e36] bg-[#0b0e11] p-3">
              <p className="text-[9px] uppercase tracking-[0.28em] text-[#6b7280]">A-list open loops</p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-amber-400/95">1</p>
              <p className="mt-1 text-[10px] text-[#8b929e]">They texted last · you haven&apos;t replied</p>
            </div>
          </div>
          <div className="border-t border-[#2a2e36] px-4 py-4">
            <p className="text-[9px] uppercase tracking-[0.28em] text-[#6b7280]">Volume</p>
            <p className="mt-1 text-xs font-medium text-[#c8cdd6]">Weekly volume — where you actually showed up</p>
            <div className="mt-4">
              <div className="flex h-36 gap-1 rounded-b-sm bg-[#0b0e11]/90 sm:h-40 sm:gap-2">
                {VOLUME_CHART_MOCK.map(({ pct }, i) => (
                  <div key={i} className="flex min-h-0 min-w-0 flex-1 flex-col justify-end">
                    <div
                      className="mx-auto w-full max-w-[2.5rem] rounded-t-sm bg-gradient-to-t from-amber-900/60 to-amber-500/55 shadow-[0_-1px_12px_rgba(245,158,11,0.12)]"
                      style={{ height: `${Math.max(12, pct)}%`, minHeight: "0.75rem" }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1 sm:gap-2">
                {VOLUME_CHART_MOCK.map(({ label }, i) => (
                  <div key={`lbl-${i}`} className="min-w-0 flex-1">
                    <span className="block whitespace-nowrap text-center font-mono text-[8px] text-[#6b7280] sm:text-[9px]">
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
          className="text-center text-[10px] uppercase tracking-[0.4em] text-[#6b7280]"
        >
          Home · thread read
        </p>
        <p className="mx-auto mt-2 max-w-lg text-center text-sm text-[#9aa1ae]">
          No vibes-only guessing. Tap the score on any card — Stack tells you what the thread is doing and what to do
          next, in straight language.
        </p>
        <div className="mt-8 overflow-hidden rounded-sm border border-[#2a2e36] bg-[#0b0e11] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="border-b border-[#2a2e36] bg-[#12161c] px-4 py-2">
            <p className="text-[9px] uppercase tracking-[0.28em] text-[#6b7280]">Sample screenshot · not your data</p>
          </div>
          <div className="p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#2a2e36]/80 pb-3">
              <div>
                <p className="text-sm font-semibold text-[#e8eaef]">Aubrey</p>
                <p className="mt-0.5 text-[9px] uppercase tracking-[0.25em] text-[#6b7280]">A-Tier</p>
              </div>
              <div className="flex max-w-[10.5rem] items-center gap-1.5 rounded-full border border-amber-500/45 bg-[#12161c] px-2 py-1 text-left ring-1 ring-amber-500/20">
                <Wand2 size={12} strokeWidth={1.5} className="shrink-0 text-amber-400/90" aria-hidden />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[12px] font-semibold tabular-nums leading-none text-amber-100/95">76</span>
                  <span className="line-clamp-2 text-[8px] font-medium leading-snug text-[#a8adb8]">
                    They texted last · tap
                  </span>
                </span>
              </div>
            </div>
            <div
              className="mt-3 border border-amber-500/30 bg-[#161b22] p-3 text-left shadow-lg"
              role="img"
              aria-label="Example Active Charisma explanation popover"
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-400/95">
                Active Charisma · 76/100 · A-Tier
              </p>
              <div className="mt-2 space-y-2.5 text-[11px] leading-snug text-[#a8adb8]">
                <p className="text-[#c8cdd6]">
                  <span className="font-medium text-[#e8eaef]">76/100</span> — they texted last about 18 hours ago.
                </p>
                <p>
                  You&apos;re nearing the ~24-hour check-in pace you set — reply when you mean it, not when you panic.
                </p>
                <p className="text-[#e8eaef]">
                  <span className="font-semibold text-amber-200/90">Next step:</span> Send one text that answers
                  what they sent and moves the thread forward (time, place, or a clear ask). Do it before you blow past
                  your own pace. After you send, log it under <span className="text-[#c8cdd6]">Texts</span> so your read
                  stays accurate.
                </p>
              </div>
            </div>
            <p className="mt-3 text-[10px] text-[#6b7280]">
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
          <p className="mt-3 text-[11px] leading-snug text-[#8b929e]">
            &ldquo;Haha okay - let&apos;s do Thursday.&rdquo;
          </p>
          <div className="mt-4 border border-[#2a2e36] bg-[#0b0e11] p-3">
            <p className="text-[9px] uppercase tracking-[0.2em] text-[#6b7280]">Suggested reply</p>
            <p className="mt-2 text-sm leading-relaxed text-[#e8eaef]">
              Let&apos;s do Sushi at 7; I&apos;ll grab us a spot and text you the place.
            </p>
          </div>
          <p className="mt-3 text-[10px] text-[#6b7280]">
            Sample only — your drafts are built from what you actually logged, not generic pickup lines.
          </p>
        </div>
      </section>

      <footer className="mx-auto max-w-3xl px-6 pb-16 text-center">
        <Link
          href="/login?mode=signup"
          className="inline-flex w-full max-w-sm items-center justify-center rounded-full border border-[#fafafa] bg-transparent px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.28em] text-[#fafafa] transition hover:bg-[#fafafa] hover:text-[#0b0e11] sm:w-auto"
        >
          Get Stack free
        </Link>
        <p className="mt-6 max-w-sm mx-auto text-[11px] leading-relaxed text-[#6b7280]">
          Free to start · roster + Texts log + one AI draft. Fewer dropped threads, less guessing what to type. Upgrade
          when it&apos;s earning its keep.
        </p>
      </footer>
    </div>
  );
}
