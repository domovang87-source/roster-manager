"use client";

import React from "react";
import { X, Check } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
  /** When true: no close control, backdrop/Escape do not dismiss (hard paywall). */
  locked?: boolean;
};

const PRO_PERKS = [
  "Don’t let A-list threads go cold — unlimited logs + screenshots (no 5-row cap)",
  "Ask Domo–style coaching in-app on Home — diagnosis, move, copy-paste text + warm/cold branches (same playbook RAG as drafts)",
  "See attention leaks vs tier (Pulse + social equity) without spreadsheet cosplay",
  "Unlimited AI drafts when you freeze mid-reply — your voice, their last move in context",
  "Up to 5 regenerations per draft (standard tier voice)",
  "Daily brief + full roster read · unlimited people · Logic Lab cadence per tier",
];

const PRO_HERO = PRO_PERKS.slice(0, 3);

const ELITE_ONLY_PERKS = [
  "Unlimited regenerations on every draft (no 5-per-draft cap)",
  "Advanced tone styles (playful, dominant, warm, minimal, …)",
  "Early access to new features",
  "Priority support with Domo — direct help on your roster, drafts, and Stack (not a ticket queue)",
];

export default function PaywallModal({ isOpen, onClose, feature, locked = false }: Props) {
  const [plan, setPlan] = React.useState<"yearly" | "monthly">("monthly");
  const [loading, setLoading] = React.useState<"pro" | "elite" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setLoading(null);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  React.useEffect(() => {
    if (!isOpen || !locked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, locked]);

  React.useEffect(() => {
    if (isOpen) setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubscribe = async (tier: "pro" | "elite") => {
    setLoading(tier);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, tier }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to start checkout.");
        setLoading(null);
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Failed to start checkout.");
      setLoading(null);
    }
  };

  const proPrice = plan === "yearly" ? "$250 / year" : "$29 / mo";
  const proSub =
    plan === "yearly"
      ? "$20.83 / mo effective · one annual charge"
      : "Billed monthly";
  const elitePrice = plan === "yearly" ? "$999 / year" : "$99 / mo";
  const eliteSub =
    plan === "yearly"
      ? "$83.25 / mo effective · one annual charge"
      : "Billed monthly";

  const continueProLabel =
    plan === "yearly" ? "Continue — $250/yr" : "Continue — $29/mo";
  const continueEliteLabel =
    plan === "yearly" ? "Continue — Elite yearly" : "Continue — $99/mo";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div className="relative my-auto w-full max-w-md border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6 sm:p-7">
        {!locked ? (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 p-1 text-[var(--rm-text-muted)]/35 transition hover:text-[var(--rm-text-muted)]/70"
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        ) : null}

        <p className="text-[11px] uppercase tracking-[0.1em] text-[var(--rm-text-muted)]">
          {feature ? `${feature}` : "STACK Pro"}
        </p>
        <h2 id="paywall-title" className="mt-1.5 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
          Keep Stack unlimited
        </h2>
        {locked ? (
          <p className="mt-3 border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-[var(--rm-text-muted)]">
            Your free roster is full. Upgrade to add more people, or remove someone from the roster first.
          </p>
        ) : null}
        <p className="mt-2 text-sm text-[var(--rm-text-muted)]">
          One tap continues to secure checkout (cards, Apple Pay, Link when available). Same app—without caps.
        </p>

        <div className="mt-5 border-2 border-emerald-500/40 bg-emerald-500/[0.06] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.1em] text-emerald-400/95">Pro · recommended</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--rm-text)]">{proPrice}</p>
              <p className="mt-0.5 text-[11px] text-[var(--rm-text-muted)]">{proSub}</p>
            </div>
          </div>

          <ul className="mt-4 space-y-2">
            {PRO_HERO.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-xs text-[var(--rm-text-muted)]">
                <Check size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-400" />
                {perk}
              </li>
            ))}
          </ul>

          <details className="mt-3 border-t border-emerald-500/20 pt-3">
            <summary className="cursor-pointer text-[11px] text-emerald-200/80 transition hover:text-emerald-100">
              Full Pro list
            </summary>
            <ul className="mt-2 space-y-1.5 border-l border-emerald-500/20 pl-3">
              {PRO_PERKS.slice(3).map((perk) => (
                <li key={perk} className="text-[11px] text-[var(--rm-text-muted)]">
                  {perk}
                </li>
              ))}
            </ul>
          </details>

          <p className="mt-4 text-[11px] leading-snug text-[var(--rm-text-muted)]">
            Charged securely by Stripe · Apple Pay, Link, and cards on the next screen
          </p>

          <button
            type="button"
            onClick={() => handleSubscribe("pro")}
            disabled={loading !== null}
            className="mt-4 w-full rounded-full bg-[var(--rm-text)] px-4 py-3.5 text-xs font-semibold tracking-wide text-[var(--rm-bg)] transition hover:opacity-90 disabled:opacity-60"
          >
            {loading === "pro" ? "Opening checkout…" : continueProLabel}
          </button>

          <p className="mt-2.5 text-center text-[11px] leading-snug text-[var(--rm-text-muted)]">
            Cancel anytime — no long contract. Manage billing from Logic Lab when you&apos;re signed in.
          </p>

          <p className="mt-3 text-center text-[11px] text-[var(--rm-text-muted)]">
            <button
              type="button"
              onClick={() => setPlan(plan === "monthly" ? "yearly" : "monthly")}
              className="text-emerald-400/90 underline decoration-emerald-500/35 underline-offset-2 transition hover:text-emerald-300"
            >
              {plan === "monthly" ? "Prefer yearly? Save vs monthly →" : "← Back to monthly"}
            </button>
          </p>
        </div>

        <details className="mt-4 group border border-amber-500/25 bg-amber-500/[0.04] px-4 py-3">
          <summary className="cursor-pointer list-none text-sm font-medium text-amber-200/95 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              <span>Elite — coaching + unlimited regen · {elitePrice}</span>
              <span className="text-[11px] font-normal uppercase tracking-[0.1em] text-amber-200/60 group-open:hidden">
                Optional
              </span>
            </span>
          </summary>
          <p className="mt-2 text-[11px] leading-snug text-[var(--rm-text-muted)]">{eliteSub}</p>
          <p className="mt-2 text-[11px] text-amber-200/75">
            Everything in Pro, plus advanced tones, unlimited regenerations per draft, and priority access to Domo for
            roster help.
          </p>
          <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto text-[11px] text-[var(--rm-text-muted)]">
            {ELITE_ONLY_PERKS.map((perk) => (
              <li key={perk} className="flex gap-2">
                <Check size={11} className="mt-0.5 shrink-0 text-amber-400/90" strokeWidth={2} />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => handleSubscribe("elite")}
            disabled={loading !== null}
            className="mt-4 w-full rounded-full border border-amber-500/55 bg-transparent py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-100 transition hover:bg-amber-500/10 disabled:opacity-60"
          >
            {loading === "elite" ? "Opening checkout…" : continueEliteLabel}
          </button>

          <p className="mt-2.5 text-center text-[11px] leading-snug text-[var(--rm-text-muted)]">
            Cancel anytime — same billing controls as Pro (Logic Lab → manage subscription).
          </p>
        </details>

        {error ? <p className="mt-4 text-center text-xs text-rose-400">{error}</p> : null}
      </div>
    </div>
  );
}
