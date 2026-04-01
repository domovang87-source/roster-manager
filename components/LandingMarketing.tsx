"use client";

import React from "react";
import Link from "next/link";
import { CircleUserRound } from "lucide-react";
import {
  ASK_DOMO_CHAT_URL,
  COACH_CALENDLY_URL,
  COACH_PROGRAMS_URL,
} from "@/lib/coach-links";

/** Simplified marketing page — fewer sections and terms for first-time visitors. */
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

      <header className="mx-auto max-w-lg px-6 pb-14 pt-12 text-center sm:pt-16">
        <h1 className="text-5xl font-light tracking-[0.5em] sm:text-6xl">STACK</h1>
        <p className="mt-5 font-light italic tracking-[0.12em] text-[var(--rm-text-muted)]">
          Your circle, curated.
        </p>
        <p className="mx-auto mt-8 text-base leading-relaxed text-[var(--rm-text-muted)]">
          Keep the people you care about in one place. Log your texts, see who needs a nudge, and get help replying when
          you freeze — without a spreadsheet or a second brain.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/login?mode=signup"
            className="inline-flex w-full max-w-xs items-center justify-center rounded-full bg-[var(--rm-accent)] px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.28em] text-white shadow-[0_0_24px_rgba(184,62,125,0.25)] transition hover:brightness-110 sm:w-auto"
          >
            Get Stack free
          </Link>
          <Link
            href="/login"
            className="text-[12px] font-medium tracking-[0.06em] text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-lg px-6 pb-16" aria-labelledby="how-heading">
        <h2 id="how-heading" className="text-center text-xs font-medium uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">
          How it works
        </h2>
        <ol className="mt-8 space-y-5 text-left text-sm leading-relaxed text-[var(--rm-text-muted)]">
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--rm-border)] text-[11px] font-semibold text-[var(--rm-text)]">
              1
            </span>
            <span>
              <strong className="font-medium text-[var(--rm-text)]">Add people</strong> to your roster and note how
              close they are — inner circle, in the mix, or check-ins.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--rm-border)] text-[11px] font-semibold text-[var(--rm-text)]">
              2
            </span>
            <span>
              <strong className="font-medium text-[var(--rm-text)]">Log messages</strong> so Stack can show who&apos;s
              quiet, who&apos;s carrying the chat, and what&apos;s still open.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-[color:var(--rm-border)] text-[11px] font-semibold text-[var(--rm-text)]">
              3
            </span>
            <span>
              <strong className="font-medium text-[var(--rm-text)]">Draft replies</strong> in your voice when you stall.
              Upgrade for unlimited logging, coaching-style help in the app, and deeper reads.
            </span>
          </li>
        </ol>
      </section>

      <section className="mx-auto max-w-lg px-6 pb-20" aria-labelledby="sample-heading">
        <h2 id="sample-heading" className="text-center text-xs font-medium uppercase tracking-[0.28em] text-[var(--rm-text-muted)]">
          Example
        </h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm text-[var(--rm-text-muted)]">
          They text you — Stack suggests a reply based on what you logged (sample below).
        </p>
        <div className="mt-8 overflow-hidden rounded-sm border border-[color:var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-5">
          <div className="border-b border-[color:var(--rm-border)]/80 pb-3">
            <p className="text-sm font-semibold text-[var(--rm-text)]">Raven</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">Someone on your roster</p>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[var(--rm-text-muted)]">
            &ldquo;Haha okay - let&apos;s do Thursday.&rdquo;
          </p>
          <div className="mt-4 border border-[color:var(--rm-border)] bg-[var(--rm-bg)] p-3">
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">Suggested reply</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--rm-text)]">
              Let&apos;s do Sushi at 7; I&apos;ll grab us a spot and text you the place.
            </p>
          </div>
          <p className="mt-3 text-[10px] text-[var(--rm-text-muted)]">Illustration only — your app uses your real log.</p>
        </div>
      </section>

      <section className="mx-auto max-w-lg px-6 pb-20 text-center">
        <p className="text-xs leading-relaxed text-[var(--rm-text-muted)]">
          <strong className="font-medium text-[var(--rm-text)]">Stack Pro</strong> adds in-app coaching (same ideas as
          your drafts) and more room to grow. Prefer the open site? Try{" "}
          <a
            href={ASK_DOMO_CHAT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--rm-accent-muted)] underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]"
          >
            Ask Domo
          </a>
          .
        </p>
      </section>

      <footer className="mx-auto max-w-lg px-6 pb-16 text-center">
        <Link
          href="/login?mode=signup"
          className="inline-flex w-full max-w-sm items-center justify-center rounded-full border border-[color:var(--rm-accent)] bg-transparent px-8 py-3.5 text-xs font-semibold uppercase tracking-[0.28em] text-[var(--rm-text)] transition hover:bg-[var(--rm-accent)] hover:text-white sm:w-auto"
        >
          Get Stack free
        </Link>
        <p className="mx-auto mt-6 max-w-sm text-[11px] leading-relaxed text-[var(--rm-text-muted)]">
          Free: one person on your roster, message log, and one AI draft. Upgrade when you want the full mirror.
        </p>
        <p className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[10px] text-[var(--rm-text-muted)]">
          <a
            href={COACH_PROGRAMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]"
          >
            Coaching &amp; programs
          </a>
          <span className="text-[var(--rm-text-muted)]/40" aria-hidden>
            ·
          </span>
          <a
            href={COACH_CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]"
          >
            Book a 1:1 session
          </a>
          <span className="text-[var(--rm-text-muted)]/40" aria-hidden>
            ·
          </span>
          <Link
            href="/privacy"
            className="underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]"
          >
            Privacy
          </Link>
        </p>
      </footer>
    </div>
  );
}
