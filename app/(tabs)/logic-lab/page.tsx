"use client";

import React from "react";
import Link from "next/link";
import PaywallModal from "../../../components/PaywallModal";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import { useSession } from "../../../lib/use-session";
import { useProStatus } from "../../../lib/use-pro-status";
import { COACH_CALENDLY_URL } from "../../../lib/coach-links";

type Tier = "A" | "B" | "C";

type RuleForm = {
  voice_profile: string;
  remind_after_days: number;
};

const tiers: Tier[] = ["A", "B", "C"];
const tierLabels: Record<Tier, string> = {
  A: "A-Tier · inner circle",
  B: "B-Tier · in the mix",
  C: "C-Tier · check-ins",
};

const defaultRules: Record<Tier, RuleForm> = {
  A: { voice_profile: "", remind_after_days: 3 },
  B: { voice_profile: "", remind_after_days: 14 },
  C: { voice_profile: "", remind_after_days: 30 },
};

const frequencyOptions = [
  { value: 1, label: "Daily" },
  { value: 7, label: "Weekly" },
  { value: 14, label: "Every 2 weeks" },
  { value: 21, label: "Every 3 weeks" },
  { value: 30, label: "Monthly" },
  { value: 60, label: "Every 2 months" },
];

const voicePlaceholders: Record<Tier, string> = {
  A: "e.g. Warm, thoughtful, match their energy. Show genuine interest.",
  B: "e.g. Friendly and casual. Keep it light but engaged.",
  C: "e.g. Short, low-effort, breezy. Just enough to stay on the radar.",
};

export default function LogicLabPage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const { userId } = useSession();
  const { isPro, checked } = useProStatus();
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [rules, setRules] = React.useState<Record<Tier, RuleForm>>({ ...defaultRules });
  const [saving, setSaving] = React.useState<Record<Tier, boolean>>({ A: false, B: false, C: false });
  const [saved, setSaved] = React.useState<Record<Tier, boolean>>({ A: false, B: false, C: false });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const config = getSupabaseConfig();
    const client = getSupabaseClient();
    supabaseRef.current = client;

    if (!client) {
      const missingParts = [
        !config.urlPresent ? "URL" : null,
        !config.keyPresent ? "Anon key" : null,
      ].filter(Boolean).join(" & ");
      setError(`Supabase is not configured (${missingParts} missing). Add env vars to .env.local and restart the dev server.`);
      return;
    }

    const fetchRules = async () => {
      setError(null);
      const { data, error: fetchError } = await client
        .from("tier_rules")
        .select("tier,voice_profile,remind_after_days");

      if (fetchError) {
        setError("Failed to load tier rules.");
        return;
      }

      setRules((prev) => {
        const next = { ...prev };
        (data ?? []).forEach((row) => {
          const tier = row.tier as Tier | undefined;
          if (!tier || !next[tier]) return;
          const remindAfterDays =
            typeof row.remind_after_days === "number"
              ? row.remind_after_days
              : defaultRules[tier].remind_after_days;
          next[tier] = {
            voice_profile: typeof row.voice_profile === "string" ? row.voice_profile : defaultRules[tier].voice_profile,
            remind_after_days: remindAfterDays,
          };
        });
        return next;
      });
    };

    fetchRules();
  }, []);

  const updateRule = (tier: Tier, patch: Partial<RuleForm>) => {
    setRules((prev) => ({ ...prev, [tier]: { ...prev[tier], ...patch } }));
  };

  const saveRule = async (tier: Tier) => {
    const client = supabaseRef.current;
    if (!client) return;
    if (checked && !isPro) {
      setShowPaywall(true);
      return;
    }
    setSaving((prev) => ({ ...prev, [tier]: true }));
    setError(null);

    const { data: authData } = await client.auth.getUser();
    const uid = authData.user?.id ?? userId;
    if (!uid) {
      setError("Sign in to save. If you are signed in, refresh the page and try again.");
      setSaving((prev) => ({ ...prev, [tier]: false }));
      return;
    }

    const rule = rules[tier];
    const payload = {
      tier,
      user_id: uid,
      voice_profile: rule.voice_profile.trim() || null,
      remind_after_days: rule.remind_after_days,
    };

    const { data: updatedRows, error: updateError } = await client
      .from("tier_rules")
      .update(payload)
      .eq("tier", tier)
      .eq("user_id", uid)
      .select("tier");

    if (updateError) {
      setError(`${tierLabels[tier]}: ${updateError.message}`);
      setSaving((prev) => ({ ...prev, [tier]: false }));
      return;
    }

    const saveError =
      updatedRows && updatedRows.length > 0
        ? null
        : (await client.from("tier_rules").insert(payload)).error;

    if (saveError) {
      setError(
        `Failed to save ${tierLabels[tier]}: ${saveError.message}. If this mentions a policy or constraint, run the latest Supabase migrations for tier_rules (user_id + RLS).`
      );
    } else {
      setSaved((prev) => ({ ...prev, [tier]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [tier]: false })), 2000);
    }

    setSaving((prev) => ({ ...prev, [tier]: false }));
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
          Rhythm
        </p>
        <h1 className="text-3xl font-semibold tracking-wide">Voice &amp; check-in rhythm</h1>
        <p className="text-sm text-[var(--rm-text-muted)]">
          Per tier (A / B / C): <strong className="text-[var(--rm-text)]">drafts on Home</strong> use the voice you save
          here, plus any Elite tone you pick. Check-in frequency below shapes Pulse and thread timing — not the wording.
        </p>
      </header>

      {error ? (
        <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 text-sm text-[var(--rm-text-muted)]">
          {error}
        </div>
      ) : null}

      {checked && !isPro ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/95">
          <span>Saving cadence &amp; voice to the cloud is a Pro feature — preview below, then upgrade to lock it in.</span>
          <button
            type="button"
            onClick={() => setShowPaywall(true)}
            className="shrink-0 border border-emerald-400/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] transition hover:bg-emerald-400/15"
          >
            See plans
          </button>
        </div>
      ) : null}

      <div className="space-y-4">
        {tiers.map((tier) => (
          <div
            key={tier}
            className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold tracking-[0.3em]">
                {tierLabels[tier]}
              </span>
              <span className="text-[10px] uppercase text-[var(--rm-text-muted)]">
                {tier}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-2 text-sm">
                How should drafts sound for {tierLabels[tier]}?
                <textarea
                  value={rules[tier].voice_profile}
                  onChange={(e) => updateRule(tier, { voice_profile: e.target.value })}
                  rows={3}
                  placeholder={voicePlaceholders[tier]}
                  className="border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3 text-sm text-[var(--rm-text)] placeholder:text-[var(--rm-text-muted)]/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                Check-in frequency
                <select
                  value={rules[tier].remind_after_days}
                  onChange={(e) => updateRule(tier, { remind_after_days: Number(e.target.value) })}
                  className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                >
                  {frequencyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--rm-text-muted)]">
                  Get nudged if you haven&apos;t interacted with a {tierLabels[tier]} person in this long.
                </span>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => saveRule(tier)}
                disabled={saving[tier]}
                className="border border-[var(--rm-border)] px-3 py-2 text-xs uppercase tracking-[0.3em] transition hover:border-[var(--rm-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving[tier] ? "Saving..." : saved[tier] ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Account — App settings + Stripe portal */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--rm-border)]/40 pt-6">
        <Link
          href="/settings"
          className="inline-flex items-center justify-center rounded-md border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--rm-text)] shadow-[0_4px_14px_rgba(0,0,0,0.25)] transition hover:border-[var(--rm-text-muted)] active:scale-[0.98]"
        >
          App settings
        </Link>
        <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <a
            href={COACH_CALENDLY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] tracking-[0.15em] text-[var(--rm-text-muted)]/55 transition hover:text-[var(--rm-text-muted)]/90"
          >
            1:1 session
          </a>
          <a
            href="https://billing.stripe.com/p/login/28E14n6m6gld4nobbM2ZO00"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] tracking-[0.15em] text-[var(--rm-text-muted)]/45 transition hover:text-[var(--rm-text-muted)]/80"
          >
            manage subscription
          </a>
        </div>
      </div>

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="Rhythm"
      />
    </div>
  );
}
