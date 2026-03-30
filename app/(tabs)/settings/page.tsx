"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  applyRmTheme,
  getStoredRmTheme,
  RM_THEME_OPTIONS,
  type RmTheme,
} from "@/lib/rm-theme";
import { COACH_CALENDLY_URL, COACH_PROGRAMS_URL } from "@/lib/coach-links";

export default function AppSettingsPage() {
  const [current, setCurrent] = useState<RmTheme>("plum");

  useEffect(() => {
    setCurrent(getStoredRmTheme());
  }, []);

  const select = (id: RmTheme) => {
    applyRmTheme(id);
    setCurrent(id);
  };

  return (
    <div className="mx-auto max-w-lg space-y-8">
      <div>
        <Link
          href="/logic-lab"
          className="text-[10px] uppercase tracking-[0.25em] text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
        >
          ← Rhythm
        </Link>
        <h1 className="mt-3 text-xl font-semibold tracking-wide">App settings</h1>
        <p className="mt-1 text-sm text-[var(--rm-text-muted)]">
          Appearance is saved on this device only.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Color scheme</h2>
        <div className="grid gap-2 sm:grid-cols-3">
          {RM_THEME_OPTIONS.map(({ id, label, hint }) => {
            const active = current === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => select(id)}
                className={`flex flex-col items-stretch gap-2 border p-3 text-left transition ${
                  active
                    ? "border-[var(--rm-accent)] bg-[var(--rm-bg-elevated)] ring-1 ring-[var(--rm-accent)]/35"
                    : "border-[var(--rm-border)] bg-[var(--rm-bg)] hover:border-[var(--rm-text-muted)]/50"
                }`}
              >
                <span
                  className="h-8 w-full rounded-sm border border-[var(--rm-border)]/60"
                  style={{
                    background:
                      id === "plum"
                        ? "linear-gradient(135deg,#141018,#3d2844)"
                        : id === "ink"
                          ? "linear-gradient(135deg,#18181b,#3f3f46)"
                          : "linear-gradient(135deg,#0f172a,#1e3a5f)",
                  }}
                  aria-hidden
                />
                <span className="text-xs font-medium text-[var(--rm-text)]">{label}</span>
                <span className="text-[10px] leading-snug text-[var(--rm-text-muted)]">{hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 border-t border-[var(--rm-border)]/40 pt-8">
        <h2 className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)]">Coaching</h2>
        <p className="text-sm leading-relaxed text-[var(--rm-text-muted)]">
          1:1 strategy and programs from the creator of Stack — separate from your subscription.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
          <a
            href={COACH_PROGRAMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--rm-accent-muted)] underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]"
          >
            Programs &amp; society
          </a>
          <a
            href={COACH_CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--rm-accent-muted)] underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]"
          >
            Book a call
          </a>
        </div>
      </section>
    </div>
  );
}
