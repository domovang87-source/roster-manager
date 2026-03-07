"use client";

import React from "react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";

type Tier = "A" | "B" | "C";
type RuleForm = {
  auto_respond: boolean;
  delay_min_hours: number;
  delay_max_hours: number;
  max_words: number;
  notification_freq_minutes: number;
  voice_profile: string;
};

const tiers: Tier[] = ["A", "B", "C"];
const tierLabels: Record<Tier, string> = {
  A: "A-Tier",
  B: "B-Tier",
  C: "C-Tier",
};
const defaultRule: RuleForm = {
  auto_respond: false,
  delay_min_hours: 0.5,
  delay_max_hours: 2,
  max_words: 60,
  notification_freq_minutes: 30,
  voice_profile: "",
};

export default function LogicLabPage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(
    null
  );
  const [rules, setRules] = React.useState<Record<Tier, RuleForm>>({
    A: { ...defaultRule },
    B: { ...defaultRule },
    C: { ...defaultRule },
  });
  const [saving, setSaving] = React.useState<Record<Tier, boolean>>({
    A: false,
    B: false,
    C: false,
  });
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const config = getSupabaseConfig();
    const client = getSupabaseClient();
    supabaseRef.current = client;

    if (!client) {
      const missingParts = [
        !config.urlPresent ? "URL" : null,
        !config.keyPresent ? "Anon key" : null,
      ]
        .filter(Boolean)
        .join(" & ");

      setError(
        `Supabase is not configured (${missingParts} missing). Add env vars to .env.local and restart the dev server.`
      );
      return;
    }

    const fetchRules = async () => {
      setError(null);
      const { data, error: fetchError } = await client
        .from("tier_rules")
        .select(
          "tier,auto_respond,delay_min_hours,delay_max_hours,max_words,notification_freq_minutes,voice_profile"
        );

      if (fetchError) {
        setError("Failed to load tier rules.");
        return;
      }

      setRules((prev) => {
        const nextRules = { ...prev };
        (data ?? []).forEach((row) => {
          const tier = row.tier as Tier | undefined;
          if (!tier || !nextRules[tier]) return;

          nextRules[tier] = {
            auto_respond: Boolean(row.auto_respond),
            delay_min_hours:
              typeof row.delay_min_hours === "number"
                ? row.delay_min_hours
                : defaultRule.delay_min_hours,
            delay_max_hours:
              typeof row.delay_max_hours === "number"
                ? row.delay_max_hours
                : defaultRule.delay_max_hours,
            max_words:
              typeof row.max_words === "number"
                ? row.max_words
                : defaultRule.max_words,
            notification_freq_minutes:
              typeof row.notification_freq_minutes === "number"
                ? row.notification_freq_minutes
                : defaultRule.notification_freq_minutes,
            voice_profile:
              typeof row.voice_profile === "string"
                ? row.voice_profile
                : defaultRule.voice_profile,
          };
        });
        return nextRules;
      });

      if (!data || data.length === 0) {
        return;
      }
    };

    fetchRules();
  }, []);

  const updateRule = (tier: Tier, patch: Partial<RuleForm>) => {
    setRules((prev) => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        ...patch,
      },
    }));
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
          auto_respond: tier === "A" ? false : rule.auto_respond,
          delay_min_hours: tier === "A" ? null : rule.delay_min_hours,
          delay_max_hours: tier === "A" ? null : rule.delay_max_hours,
          max_words: tier === "A" ? null : rule.max_words,
          notification_freq_minutes:
            tier === "A" ? rule.notification_freq_minutes : null,
          voice_profile: tier === "A" ? rule.voice_profile : null,
        },
        { onConflict: "tier" }
      );

    if (saveError) {
      setError(`Failed to save rule for tier ${tier}.`);
    }

    setSaving((prev) => ({ ...prev, [tier]: false }));
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
          Logic Lab
        </p>
        <h1 className="text-3xl font-semibold tracking-wide">
          Response Rule Engine
        </h1>
        <p className="text-sm text-[var(--rm-text-muted)]">
          Define automated reply rules by tier.
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

            {tier === "A" ? (
              <div className="mt-4 space-y-4">
                <label className="flex flex-col gap-2 text-sm">
                  Notification Frequency
                  <select
                    value={rules[tier].notification_freq_minutes}
                    onChange={(event) =>
                      updateRule(tier, {
                        notification_freq_minutes: Number(event.target.value),
                      })
                    }
                    className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                  >
                    <option value={15}>15m</option>
                    <option value={30}>30m</option>
                    <option value={60}>1h</option>
                    <option value={120}>2h</option>
                  </select>
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  How do you want your AI to sound when suggesting A-Tier replies?
                  <textarea
                    value={rules[tier].voice_profile}
                    onChange={(event) =>
                      updateRule(tier, { voice_profile: event.target.value })
                    }
                    rows={6}
                    className="border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3 text-sm text-[var(--rm-text)]"
                  />
                </label>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rules[tier].auto_respond}
                    onChange={(event) =>
                      updateRule(tier, { auto_respond: event.target.checked })
                    }
                    className="h-4 w-4 accent-[var(--rm-text)]"
                  />
                  Auto-respond
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  Delay min (hours)
                  <input
                    type="number"
                    step="0.25"
                    value={rules[tier].delay_min_hours}
                    onChange={(event) =>
                      updateRule(tier, {
                        delay_min_hours: Number(event.target.value || 0),
                      })
                    }
                    className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  Delay max (hours)
                  <input
                    type="number"
                    step="0.25"
                    value={rules[tier].delay_max_hours}
                    onChange={(event) =>
                      updateRule(tier, {
                        delay_max_hours: Number(event.target.value || 0),
                      })
                    }
                    className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                  />
                </label>

                <label className="flex flex-col gap-2 text-sm">
                  Max words
                  <input
                    type="number"
                    value={rules[tier].max_words}
                    onChange={(event) =>
                      updateRule(tier, {
                        max_words: Number(event.target.value || 0),
                      })
                    }
                    className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                  />
                </label>
              </div>
            )}

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                Saved per tier
              </p>
              <button
                type="button"
                onClick={() => saveRule(tier)}
                disabled={saving[tier]}
                className="border border-[var(--rm-border)] px-3 py-2 text-xs uppercase tracking-[0.3em] transition hover:border-[var(--rm-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving[tier] ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
