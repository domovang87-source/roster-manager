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
  "Unlimited text logs + screenshots (no 5-message cap)",
  "Unlimited AI reply drafts in your voice",
  "Up to 5 regenerations per draft (standard tier voice)",
  "Daily AI brief + full portfolio read",
  "Unlimited roster · save Logic Lab cadence & voice per tier",
];

/** Shown under “Elite only” — Pro list is repeated above so Elite = Pro + these. */
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

  const proPrice = plan === "yearly" ? "$250 / year" : "$29 / month";
  const proSub =
    plan === "yearly" ? "$20.83 / mo · billed annually" : "cancel anytime";
  const elitePrice = plan === "yearly" ? "$999 / year" : "$99 / month";
  const eliteSub =
    plan === "yearly" ? "$83.25 / mo · billed annually" : "cancel anytime";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center overflow-y-auto bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paywall-title"
    >
      <div className="relative my-auto w-full max-w-2xl border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6 sm:p-8">
        {!locked ? (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 p-1 text-[var(--rm-text-muted)]/20 transition hover:text-[var(--rm-text-muted)]/50"
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        ) : null}

        <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--rm-text-muted)]">
          {feature ? `${feature} · paid plans` : "STACK · Pro & Elite"}
        </p>
        <h2 id="paywall-title" className="mt-1.5 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
          Stop losing connections.
        </h2>
        {locked ? (
          <p className="mt-3 border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-[var(--rm-text-muted)]">
            Your free roster is full. Upgrade to add more people, or remove someone from the roster first.
          </p>
        ) : null}
        <p className="mt-2 text-sm text-[var(--rm-text-muted)]">
          Stack helps you stay in rhythm with the people who matter—so you actually text back (correctly), show up, and get
          traction instead of letting good threads go cold.
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
            Billing
          </p>
          <div className="flex items-center rounded-full border border-[var(--rm-border)] p-0.5 text-[10px] uppercase tracking-[0.15em]">
            <button
              type="button"
              onClick={() => setPlan("monthly")}
              className={`rounded-full px-3 py-1 transition ${
                plan === "monthly"
                  ? "bg-emerald-500/25 font-medium text-emerald-300 ring-1 ring-emerald-500/35"
                  : "text-[var(--rm-text-muted)] hover:text-[var(--rm-text)]"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setPlan("yearly")}
              className={`rounded-full px-3 py-1 transition ${
                plan === "yearly"
                  ? "bg-[var(--rm-text)]/10 text-[var(--rm-text)]"
                  : "text-[var(--rm-text-muted)]/80 hover:text-[var(--rm-text-muted)]"
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        {plan === "monthly" ? (
          <p className="mt-2 text-[11px] leading-snug text-[var(--rm-text-muted)]">
            <span className="text-[var(--rm-text)]">Monthly is the default</span> (Pro $29/mo, Elite $99/mo). Switch to
            yearly if you want the lower effective rate.
          </p>
        ) : (
          <p className="mt-2 text-[10px] uppercase tracking-[0.1em] text-emerald-400/80">
            ✦ save vs monthly on annual
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {/* Pro — most popular */}
          <div className="relative flex flex-col border-2 border-emerald-500/45 bg-emerald-500/[0.04] p-5">
            <span className="absolute -top-2.5 left-4 bg-emerald-500/90 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.2em] text-[var(--rm-bg)]">
              Most popular
            </span>
            <p className="text-[11px] uppercase tracking-[0.3em] text-emerald-400/90">Pro</p>
            <p className="mt-3 text-lg font-semibold">{proPrice}</p>
            <p className="mt-0.5 text-[11px] text-[var(--rm-text-muted)]">{proSub}</p>
            <ul className="mt-4 flex-1 space-y-2">
              {PRO_PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-2.5 text-xs text-[var(--rm-text-muted)]">
                  <Check size={13} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-400" />
                  {perk}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => handleSubscribe("pro")}
              disabled={loading !== null}
              className="mt-5 w-full rounded-full bg-[var(--rm-text)] px-4 py-3 text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--rm-bg)] transition hover:opacity-90 disabled:opacity-60"
            >
              {loading === "pro" ? "Loading..." : "Get Pro"}
            </button>
          </div>

          {/* Elite = everything in Pro + extras */}
          <div className="flex flex-col border border-amber-500/35 bg-amber-500/[0.03] p-5">
            <p className="text-[11px] uppercase tracking-[0.3em] text-amber-400/90">Elite</p>
            <p className="mt-3 text-lg font-semibold">{elitePrice}</p>
            <p className="mt-0.5 text-[11px] text-[var(--rm-text-muted)]">{eliteSub}</p>
            {plan === "monthly" ? (
              <p className="mt-2 text-[10px] leading-snug text-amber-200/80">
                Monthly Elite is the sweet spot if you want ongoing priority support with Domo — real answers on
                your roster and drafts, not a help desk ticket.
              </p>
            ) : null}
            <div className="mt-4 flex-1 space-y-4">
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
                  Everything in Pro
                </p>
                <ul className="space-y-1.5">
                  {PRO_PERKS.map((perk) => (
                    <li
                      key={`elite-pro-${perk}`}
                      className="flex items-start gap-2 text-[11px] leading-snug text-[var(--rm-text-muted)]"
                    >
                      <Check size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-emerald-500/75" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-amber-400/95">
                  Elite only
                </p>
                <ul className="space-y-1.5">
                  {ELITE_ONLY_PERKS.map((perk) => (
                    <li
                      key={perk}
                      className="flex items-start gap-2 text-[11px] leading-snug text-[var(--rm-text-muted)]"
                    >
                      <Check size={12} strokeWidth={2} className="mt-0.5 shrink-0 text-amber-400" />
                      {perk}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSubscribe("elite")}
              disabled={loading !== null}
              className="mt-5 w-full rounded-full border border-amber-500/50 bg-transparent px-4 py-3 text-[10px] font-medium uppercase tracking-[0.28em] text-amber-200/95 transition hover:bg-amber-500/10 disabled:opacity-60"
            >
              {loading === "elite" ? "Loading..." : "Get Elite"}
            </button>
          </div>
        </div>

        {error && <p className="mt-4 text-xs text-rose-400">{error}</p>}
      </div>
    </div>
  );
}
