"use client";

import React from "react";
import { X } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
};

export default function PaywallModal({ isOpen, onClose, feature }: Props) {
  const [plan, setPlan] = React.useState<"yearly" | "monthly">("yearly");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset loading when user presses back from Stripe (bfcache restore)
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
      <div className="relative w-full max-w-sm border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-8 text-center">

        {/* Subtle close */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 p-1 text-[var(--rm-text-muted)]/20 transition hover:text-[var(--rm-text-muted)]/50"
        >
          <X size={14} strokeWidth={1.5} />
        </button>

        <h2 className="text-lg font-semibold tracking-wide">Upgrade to STACK Pro</h2>

        <p className="mt-2 text-sm text-[var(--rm-text-muted)]">
          {feature ? `${feature} is a Pro feature. ` : ""}
          Unlimited roster, AI drafts, and more.
        </p>

        {/* Price */}
        <div className="mt-6">
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-4xl font-semibold tracking-tight">
              {plan === "yearly" ? "$250" : "$29"}
            </span>
            <span className="text-sm text-[var(--rm-text-muted)]">
              {plan === "yearly" ? "/ yr" : "/ mo"}
            </span>
            {plan === "yearly" && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.15em] text-emerald-400">
                Save 28%
              </span>
            )}
          </div>
          {plan === "yearly" && (
            <p className="mt-1 text-[11px] text-[var(--rm-text-muted)]">$20.83 / mo · billed annually</p>
          )}
        </div>

        {error && <p className="mt-3 text-xs text-rose-400">{error}</p>}

        {/* Primary CTA */}
        <button
          type="button"
          onClick={handleSubscribe}
          disabled={loading}
          className="mt-5 w-full rounded-full bg-[var(--rm-text)] px-6 py-3 text-xs font-medium uppercase tracking-[0.3em] text-[var(--rm-bg)] transition hover:opacity-90 disabled:opacity-60"
        >
          {loading ? "Loading..." : "Subscribe"}
        </button>

        {/* Monthly toggle — tiny & subtle */}
        <button
          type="button"
          onClick={() => setPlan(plan === "yearly" ? "monthly" : "yearly")}
          className="mt-3 text-[11px] text-[var(--rm-text-muted)]/40 transition hover:text-[var(--rm-text-muted)]/70"
        >
          {plan === "yearly" ? "or $29 / month" : "or $250 / year (save 28%)"}
        </button>

      </div>
    </div>
  );
}
