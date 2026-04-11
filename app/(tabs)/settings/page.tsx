"use client";

import React from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import PaywallModal from "@/components/PaywallModal";
import {
  getSupabaseClient,
  getSupabaseConfig,
} from "@/lib/supabase/client";
import { useSession } from "@/lib/use-session";
import { useProStatus } from "@/lib/use-pro-status";
import {
  applyRmTheme,
  getStoredRmTheme,
  RM_THEME_OPTIONS,
  type RmTheme,
} from "@/lib/rm-theme";
import { COACH_CALENDLY_URL, COACH_PROGRAMS_URL } from "@/lib/coach-links";

/* ------------------------------------------------------------------ */
/*  Voice & rhythm constants                                          */
/* ------------------------------------------------------------------ */

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

const STRIPE_BILLING_URL =
  "https://billing.stripe.com/p/login/28E14n6m6gld4nobbM2ZO00";

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const { toast } = useToast();
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(
    null,
  );
  const { userId } = useSession();
  const { isPro, checked, accountTier } = useProStatus();

  /* Voice & rhythm state */
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [rules, setRules] = React.useState<Record<Tier, RuleForm>>({
    ...defaultRules,
  });
  const [saving, setSaving] = React.useState<Record<Tier, boolean>>({
    A: false,
    B: false,
    C: false,
  });
  const [configError, setConfigError] = React.useState<string | null>(null);

  /* Theme state */
  const [theme, setTheme] = React.useState<RmTheme>("plum");

  React.useEffect(() => {
    setTheme(getStoredRmTheme());
  }, []);

  /* Fetch existing tier rules on mount */
  React.useEffect(() => {
    const config = getSupabaseConfig();
    const client = getSupabaseClient();
    supabaseRef.current = client;

    if (!client) {
      const missing = [
        !config.urlPresent ? "URL" : null,
        !config.keyPresent ? "Anon key" : null,
      ]
        .filter(Boolean)
        .join(" & ");
      setConfigError(
        `Supabase is not configured (${missing} missing). Add env vars to .env.local and restart the dev server.`,
      );
      return;
    }

    const fetchRules = async () => {
      setConfigError(null);
      const { data, error: fetchError } = await client
        .from("tier_rules")
        .select("tier,voice_profile,remind_after_days");

      if (fetchError) {
        setConfigError("Failed to load tier rules.");
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
            voice_profile:
              typeof row.voice_profile === "string"
                ? row.voice_profile
                : defaultRules[tier].voice_profile,
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

    const { data: authData } = await client.auth.getUser();
    const uid = authData.user?.id ?? userId;
    if (!uid) {
      toast(
        "Sign in to save. If you are signed in, refresh the page and try again.",
        "error",
      );
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
      toast(`${tierLabels[tier]}: ${updateError.message}`, "error");
      setSaving((prev) => ({ ...prev, [tier]: false }));
      return;
    }

    const saveError =
      updatedRows && updatedRows.length > 0
        ? null
        : (await client.from("tier_rules").insert(payload)).error;

    if (saveError) {
      toast(
        `Failed to save ${tierLabels[tier]}: ${saveError.message}`,
        "error",
      );
    } else {
      toast(`${tierLabels[tier]} saved`, "success");
    }

    setSaving((prev) => ({ ...prev, [tier]: false }));
  };

  const selectTheme = (id: RmTheme) => {
    applyRmTheme(id);
    setTheme(id);
  };

  const handleSignOut = async () => {
    const { createBrowserSupabase } = await import("@/lib/supabase/browser");
    await createBrowserSupabase().auth.signOut();
    window.location.href = "/login";
  };

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  const tierBadgeLabel =
    accountTier === "elite"
      ? "Elite"
      : accountTier === "pro"
        ? "Pro"
        : accountTier === "free"
          ? "Free"
          : "…";

  return (
    <div className="mx-auto max-w-2xl space-y-10 pb-24">
      <PageHeader title="Settings" subtitle="Voice, appearance, and account" />

      {/* ── 1. Voice & rhythm ──────────────────────────────────── */}

      <section className="space-y-4">
        <div>
          <h2 className="label text-[var(--rm-text-muted)]">
            Voice and rhythm
          </h2>
          <p className="mt-1 text-sm text-[var(--rm-text-muted)]">
            Per tier: <strong className="text-[var(--rm-text)]">drafts on Home</strong> use
            the voice you save here. Check-in frequency shapes Pulse and thread
            timing.
          </p>
        </div>

        {configError && (
          <Card>
            <p className="text-sm text-[var(--rm-text-muted)]">{configError}</p>
          </Card>
        )}

        {checked && !isPro && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100/95">
            <span>
              Saving cadence &amp; voice to the cloud is a Pro feature —
              preview below, then upgrade to lock it in.
            </span>
            <button
              type="button"
              onClick={() => setShowPaywall(true)}
              className="label shrink-0 rounded-lg border border-emerald-400/50 px-3 py-1.5 transition hover:bg-emerald-400/15"
            >
              See plans
            </button>
          </div>
        )}

        {tiers.map((tier) => (
          <Card key={tier} as="section">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{tierLabels[tier]}</span>
              <span className="label text-[var(--rm-text-muted)]">{tier}</span>
            </div>

            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-2 text-sm">
                How should drafts sound for {tierLabels[tier]}?
                <textarea
                  value={rules[tier].voice_profile}
                  onChange={(e) =>
                    updateRule(tier, { voice_profile: e.target.value })
                  }
                  rows={3}
                  placeholder={voicePlaceholders[tier]}
                  className="rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3 text-sm text-[var(--rm-text)] placeholder:text-[var(--rm-text-muted)]/50"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                Check-in frequency
                <select
                  value={rules[tier].remind_after_days}
                  onChange={(e) =>
                    updateRule(tier, {
                      remind_after_days: Number(e.target.value),
                    })
                  }
                  className="h-10 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                >
                  {frequencyOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-[var(--rm-text-muted)]">
                  Get nudged if you haven&apos;t interacted with a{" "}
                  {tierLabels[tier]} person in this long.
                </span>
              </label>
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => saveRule(tier)}
                disabled={saving[tier]}
                className="label rounded-lg border border-[var(--rm-border)] px-3 py-2 transition hover:border-[var(--rm-text)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving[tier] ? "Saving…" : "Save"}
              </button>
            </div>
          </Card>
        ))}
      </section>

      {/* ── 2. Appearance ──────────────────────────────────────── */}

      <section className="space-y-4">
        <div>
          <h2 className="label text-[var(--rm-text-muted)]">Appearance</h2>
          <p className="mt-1 text-sm text-[var(--rm-text-muted)]">
            Saved on this device only.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {RM_THEME_OPTIONS.map(({ id, label, hint }) => {
            const active = theme === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectTheme(id)}
                className={`flex flex-col items-stretch gap-2 rounded-lg border p-3 text-left transition ${
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
                <span className="text-xs font-medium text-[var(--rm-text)]">
                  {label}
                </span>
                <span className="text-[11px] leading-snug text-[var(--rm-text-muted)]">
                  {hint}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── 3. Account ─────────────────────────────────────────── */}

      <section className="space-y-4">
        <h2 className="label text-[var(--rm-text-muted)]">Account</h2>

        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--rm-text)]">
                Current plan
              </span>
              <span className="rounded-md border border-[var(--rm-border)] bg-[var(--rm-bg)] px-2 py-0.5 text-xs font-medium text-[var(--rm-text-muted)]">
                {tierBadgeLabel}
              </span>
            </div>
            <a
              href={STRIPE_BILLING_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="label text-[var(--rm-accent-muted)] underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]"
            >
              Manage subscription
            </a>
          </div>
        </Card>

        <button
          type="button"
          onClick={handleSignOut}
          className="label rounded-lg border border-[var(--rm-border)] px-4 py-2.5 text-[var(--rm-text-muted)] transition hover:border-rose-400/50 hover:text-rose-300"
        >
          Sign out
        </button>
      </section>

      {/* ── 4. Coaching ────────────────────────────────────────── */}

      <section className="space-y-3">
        <h2 className="label text-[var(--rm-text-muted)]">Coaching</h2>
        <p className="text-sm leading-relaxed text-[var(--rm-text-muted)]">
          1:1 strategy and programs from the creator of Stack — separate from
          your subscription.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
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

      {/* ── 5. About ───────────────────────────────────────────── */}

      <section className="space-y-3">
        <h2 className="label text-[var(--rm-text-muted)]">About</h2>
        <Link
          href="/privacy"
          className="text-sm font-medium text-[var(--rm-accent-muted)] underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]"
        >
          Privacy policy
        </Link>
      </section>

      {/* ── Paywall ────────────────────────────────────────────── */}

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="Rhythm"
      />
    </div>
  );
}
