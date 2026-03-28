"use client";

import React from "react";
import { Lock } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
};

const PLANS = {
  yearly:  { label: "Yearly",  price: "$250",  sub: "$20.83 / mo · billed annually", badge: "Save 40%" },
  monthly: { label: "Monthly", price: "$9.99", sub: "billed monthly",                badge: null },
};

export default function PaywallModal({ isOpen, onClose, feature }: Props) {
  const [plan, setPlan] = React.useState<"yearly" | "monthly">("yearly");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const selected = PLANS[plan];

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
      <div className="w-full max-w-sm border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center border border-[var(--rm-border)]">
          <Lock size={20} strokeWidth={1.25} className="text-[var(--rm-text-muted)]" />
        </div>

        <h2 className="mt-5 text-lg font-semibold tracking-wide">
          Upgrade to STACK Pro
        </h2>

        <p className="mt-2 text-sm text-[var(--rm-text-muted)]">
          {feature ? `${feature} is a Pro feature. ` : ""}
          Unlimited roster, AI drafts, and more.
        </p>

        {/* Toggle */}
        <div className="mt-6 flex items-center justify-center rounded-full border border-[var(--rm-border)] p-1">
          {(["yearly", "monthly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlan(p)}
              className={`flex-1 rounded-full px-4 py-1.5 text-xs uppercase tracking-[0.2em] transition ${
                plan === p
                  ? "bg-[var(--rm-text)] text-[var(--rm-bg)] font-medium"
                  : "text-[var(--rm-text-muted)] hover:text-[var(--rm-text)]"
              }`}
            >
              {PLANS[p].label}
            </button>
          ))}
        </div>

        {/* Price display */}
        <div className="mt-5">
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-3xl font-semibold tracking-tight">{selected.price}</span>
            <span className="text-sm text-[var(--rm-text-muted)]">
              {plan === "yearly" ? "/ yr" : "/ mo"}
            </span>
            {selected.badge && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-emerald-400">
                {selected.badge}
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-[var(--rm-text-muted)]">{selected.sub}</p>
        </div>

        {error ? (
          <p className="mt-3 text-xs text-rose-400">{error}</p>
        ) : null}

        <button
          type="button"
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-6 w-full rounded-full bg-[var(--rm-text)] px-6 py-3 text-xs font-medium uppercase tracking-[0.3em] text-[var(--rm-bg)] transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Subscribe"}
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-xs tracking-[0.1em] text-[var(--rm-text-muted)]/40 transition hover:text-[var(--rm-text-muted)]"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
