"use client";

import React from "react";
import { Lock } from "lucide-react";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  feature?: string;
};

export default function PaywallModal({ isOpen, onClose, feature }: Props) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
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
          {feature
            ? `${feature} is a Pro feature.`
            : "You've hit the free plan limit."}
          {" "}Unlock unlimited roster members, AI-generated drafts, and more.
        </p>

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
          className="mt-3 text-xs tracking-[0.1em] text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
        >
          Maybe later
        </button>
      </div>
    </div>
  );
}
