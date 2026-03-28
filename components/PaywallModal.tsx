"use client";

import React from "react";
import { X, Check } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
};

const PERKS = [
  "Unlimited roster members",
  "AI drafts in your voice",
  "Never ghost — smart reminders",
  "Tier your circle A / B / C",
];

export default function PaywallModal({ isOpen, onClose, feature }: Props) {
  const [plan, setPlan] = React.useState<"yearly" | "monthly">("yearly");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const reset = (e: PageTransitionEvent) => {
      if (e.persisted) setLoading(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to start checkout.");
        setLoading(false);
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Failed to start checkout.");
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-6">
      <div className="relative w-full max-w-sm border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-7">

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1 text-[var(--rm-text-muted)]/20 transition hover:text-[var(--rm-text-muted)]/50"
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        {/* Header */}
        <p className="text-[10px] uppercase tracking-[0.35em] text-[var(--rm-text-muted)]">
          {feature ? `${feature} · Pro only` : "STACK Pro"}
        </p>
        <h2 className="mt-1.5 text-xl font-semibold leading-snug tracking-tight">
          Your second brain<br />for dating.
        </h2>

        {/* Perks */}
        <ul className="mt-4 space-y-2">
          {PERKS.map((perk) => (
            <li key={perk} className="flex items-center gap-2.5 text-sm text-[var(--rm-text-muted)]">
              <Check size={13} strokeWidth={2} className="shrink-0 text-emerald-400" />
              {perk}
            </li>
          ))}
        </ul>

        {/* Divider */}
        <div className="my-5 border-t border-[var(--rm-border)]" />

        {/* Plan toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-semibold">
              {plan === "yearly" ? "$250 / year" : "$29 / month"}
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--rm-text-muted)]">
              {plan === "yearly" ? "$20.83 / mo · billed annually" : "cancel anytime"}
            </p>
          </div>

          {/* Pill toggle */}
          <div className="flex items-center rounded-full border border-[var(--rm-border)] p-0.5 text-[10px] uppercase tracking-[0.15em]">
            <button
              type="button"
              onClick={() => setPlan("yearly")}
              className={`rounded-full px-3 py-1 transition ${
                plan === "yearly"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "text-[var(--rm-text-muted)] hover:text-[var(--rm-text)]"
              }`}
            >
              Yearly
            </button>
            <button
              type="button"
              onClick={() => setPlan("monthly")}
              className={`rounded-full px-3 py-1 transition ${
                plan === "monthly"
                  ? "bg-[var(--rm-text)]/10 text-[var(--rm-text)]"
                  : "text-[var(--rm-text-muted)] hover:text-[var(--rm-text)]"
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {plan === "yearly" && (
          <p className="mt-1.5 text-[10px] text-emerald-400/80 tracking-[0.1em] uppercase">
            ✦ save 28% vs monthly
          </p>
        )}

        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

        {/* CTA */}
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-5 w-full rounded-full bg-[var(--rm-text)] px-6 py-3 text-xs font-medium uppercase tracking-[0.3em] text-[var(--rm-bg)] transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Get Pro"}
        </button>

      </div>
    </div>
  );
}
