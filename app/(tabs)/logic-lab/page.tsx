"use client";

import React from "react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import { useSession } from "../../../lib/use-session";

type Tier = "A" | "B" | "C";

type RuleForm = {
  voice_profile: string;
  remind_after_days: number;
};

const tiers: Tier[] = ["A", "B", "C"];
const tierLabels: Record<Tier, string> = {
  A: "A-Tier",
  B: "B-Tier",
  C: "C-Tier",
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
        setError("Failed to load settings.");
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
    setSaving((prev) => ({ ...prev, [tier]: true }));
    setError(null);

    const rule = rules[tier];
    const { error: saveError } = await client
      .from("tier_rules")
      .upsert(
        {
          tier,
          voice_profile: rule.voice_profile || null,
          remind_after_days: rule.remind_after_days,
          ...(userId ? { user_id: userId } : {}),
        },
        { onConflict: userId ? "user_id,tier" : "tier" }
      );

    if (saveError) {
      setError(`Failed to save ${tierLabels[tier]} settings.`);
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
          Settings
        </p>
        <h1 className="text-3xl font-semibold tracking-wide">AI & Reminders</h1>
        <p className="text-sm text-[var(--rm-text-muted)]">
          Set how drafts sound per tier and how often you want to stay in touch.
        </p>
      </header>

      {error ? (
        <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 text-sm text-[var(--rm-text-muted)]">
          {error}
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

      {/* Account — buried at the bottom, as requested */}
      <div className="pt-6">
        <a
          href="https://billing.stripe.com/p/login/28E14n6m6gld4nobbM2ZO00"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] tracking-[0.15em] text-[var(--rm-text-muted)]/30 transition hover:text-[var(--rm-text-muted)]/60"
        >
          manage subscription
        </a>
      </div>
    </div>
  );
}
