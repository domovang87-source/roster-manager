"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { CheckCircle2, Edit2, ImagePlus, MessageSquare, Save, Share, UserPlus, X } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import PaywallModal from "../../../components/PaywallModal";
import { useProStatus } from "../../../lib/use-pro-status";

const FREE_ROSTER_LIMIT = 1;

type Tier = "A" | "B" | "C";

type TierProspect = {
  id: string;
  name: string;
  tier: Tier;
  phoneNumber?: string;
  vibeNotes?: string;
  lastInboundBody?: string;
  /** Most recent log line (any type / direction), for the time badge */
  lastActivityAt?: string;
  draftId?: string;
  draftText?: string;
};

type UndoToast = {
  draftId: string;
  prospectId: string;
  tier: Tier;
  text: string;
};

type DismissedDraft = {
  id: string;
  prospectId: string;
  prospectName: string;
  tier: Tier;
  text?: string;
  draftId?: string;
  dismissedAt: string;
};

const LOCAL_DISMISSED_KEY = "stack_home_dismissed_cards_v1";

export default function HomePage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const [synopsis, setSynopsis] = React.useState("Awaiting AI summary...");
  const [loadingNarrative, setLoadingNarrative] = React.useState(true);
  const [tierProspects, setTierProspects] = React.useState<Record<Tier, TierProspect[]>>({ A: [], B: [], C: [] });
  const [rosterCount, setRosterCount] = React.useState(0);
  const [activityCount, setActivityCount] = React.useState(0);
  const [editingDraftId, setEditingDraftId] = React.useState<string | null>(null);
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const [isGenerating, setIsGenerating] = React.useState<string | null>(null);
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [paywallFeature, setPaywallFeature] = React.useState<string | undefined>(undefined);
  const [dismissingDraftIds, setDismissingDraftIds] = React.useState<Record<string, boolean>>({});
  const [undoToast, setUndoToast] = React.useState<UndoToast | null>(null);
  const [dismissedDrafts, setDismissedDrafts] = React.useState<DismissedDraft[]>([]);
  const [dismissedOpen, setDismissedOpen] = React.useState(false);
  const { isPro, markPro } = useProStatus();
  const [justUpgraded, setJustUpgraded] = React.useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();

  React.useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;

    fetch("/api/verify-checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then((r) => r.json())
      .then((data: { pro?: boolean; error?: string }) => {
        if (data.pro) {
          markPro();
          setJustUpgraded(true);
          setTimeout(() => setJustUpgraded(false), 5000);
        } else if (data.error) {
          setError(data.error);
        }
        router.replace("/home", { scroll: false });
      })
      .catch(() => {
        setError("Could not confirm payment. If Stripe completed, check Supabase migrations and refresh.");
        router.replace("/home", { scroll: false });
      });
  }, [searchParams, router, markPro]);

  const shareDraftText = async (text: string, prospectName: string) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          text,
          title: `Draft for ${prospectName}`,
        });
        return;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setError("Could not share or copy this draft.");
    }
  };

  React.useEffect(() => {
    if (!undoToast) return;
    const t = setTimeout(() => setUndoToast(null), 6000);
    return () => clearTimeout(t);
  }, [undoToast]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LOCAL_DISMISSED_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DismissedDraft[];
      if (!Array.isArray(parsed)) return;
      setDismissedDrafts((prev) => {
        const map = new Map<string, DismissedDraft>();
        [...prev, ...parsed].forEach((d) => map.set(d.id, d));
        return Array.from(map.values());
      });
    } catch {
      // ignore cache parse failure
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const localOnly = dismissedDrafts.filter((d) => !d.draftId);
    window.localStorage.setItem(LOCAL_DISMISSED_KEY, JSON.stringify(localOnly));
  }, [dismissedDrafts]);

  const handleDismissCard = async (prospect: TierProspect, draftId?: string, draftText?: string) => {
    const dismissKey = draftId || prospect.id;
    setDismissingDraftIds((prev) => ({ ...prev, [dismissKey]: true }));

    // Hide from active feed immediately.
    setDismissedDrafts((prev) => [
      {
        id: dismissKey,
        prospectId: prospect.id,
        prospectName: prospect.name,
        tier: prospect.tier,
        text: draftText,
        draftId,
        dismissedAt: new Date().toISOString(),
      },
      ...prev.filter((d) => d.id !== dismissKey),
    ]);

    if (!draftId) return;

    // If there is a draft, mark it dismissed server-side.
    try {
      const res = await fetch("/api/dismiss-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: draftId }),
      });

      if (!res.ok) {
        setError("Failed to dismiss draft.");
        setDismissingDraftIds((prev) => ({ ...prev, [dismissKey]: false }));
        return;
      }

      setUndoToast({
        draftId,
        prospectId: prospect.id,
        tier: prospect.tier,
        text: draftText ?? "",
      });
    } catch {
      setError("Failed to dismiss draft.");
      setDismissingDraftIds((prev) => ({ ...prev, [dismissKey]: false }));
    }
  };

  const handleUndoDismiss = async () => {
    if (!undoToast) return;
    const toast = undoToast;
    setUndoToast(null);
    try {
      const res = await fetch("/api/undo-dismiss-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draft_id: toast.draftId }),
      });
      if (!res.ok) {
        setError("Failed to undo dismissal.");
        return;
      }
      setTierProspects((prev) => {
        const next = { ...prev };
        next[toast.tier] = next[toast.tier].map((p) =>
          p.id === toast.prospectId ? { ...p, draftId: toast.draftId, draftText: toast.text } : p
        );
        return next;
      });
      setDraftEdits((prev) => ({ ...prev, [toast.draftId]: toast.text }));
      setDismissingDraftIds((prev) => ({ ...prev, [toast.draftId]: false }));
      setDismissedDrafts((prev) => prev.filter((d) => d.id !== toast.draftId));
    } catch {
      setError("Failed to undo dismissal.");
    }
  };

  const handleRestoreDismissed = async (draft: DismissedDraft) => {
    try {
      if (draft.draftId) {
        const res = await fetch("/api/undo-dismiss-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_id: draft.draftId }),
        });
        if (!res.ok) {
          setError("Failed to restore draft.");
          return;
        }
      }

      const client = supabaseRef.current;
      if (!client) {
        setError("Failed to restore draft.");
        return;
      }

      const [{ data: prospectRow }, { data: inboundRows }, { data: scheduledRows }] =
        await Promise.all([
          client
            .from("prospects")
            .select("id,name,tier,phone_number,vibe_notes")
            .eq("id", draft.prospectId)
            .single(),
          client
            .from("messages")
            .select("body,created_at,direction")
            .eq("prospect_id", draft.prospectId)
            .order("created_at", { ascending: false })
            .limit(80),
          client
            .from("scheduled_replies")
            .select("id,draft_text")
            .eq("prospect_id", draft.prospectId)
            .eq("status", "scheduled")
            .order("created_at", { ascending: false })
            .limit(1),
        ]);

      if (!prospectRow) {
        setError("Failed to restore draft.");
        return;
      }

      const refreshedTier = (prospectRow.tier as Tier) ?? draft.tier;
      const msgRows = inboundRows ?? [];
      const latestAny = msgRows[0];
      const inboundLatest = msgRows.find((r) => r.direction === "inbound");
      const scheduled = (scheduledRows ?? [])[0];

      setDismissedDrafts((prev) => prev.filter((d) => d.id !== draft.id));
      setDismissingDraftIds((prev) => {
        const next = { ...prev };
        delete next[draft.id];
        if (draft.draftId) delete next[draft.draftId];
        delete next[draft.prospectId];
        return next;
      });
      setTierProspects((prev) => {
        const next = { ...prev };
        (Object.keys(next) as Tier[]).forEach((tier) => {
          next[tier] = next[tier].filter((p) => p.id !== draft.prospectId);
        });
        next[refreshedTier] = [
          {
            id: String(prospectRow.id),
            name: prospectRow.name ?? draft.prospectName,
            tier: refreshedTier,
            phoneNumber: prospectRow.phone_number ?? undefined,
            vibeNotes: (prospectRow.vibe_notes as string) ?? undefined,
            lastInboundBody: (inboundLatest?.body as string) ?? undefined,
            lastActivityAt: (latestAny?.created_at as string) ?? undefined,
            draftId: (scheduled?.id as string) ?? undefined,
            draftText: (scheduled?.draft_text as string) ?? undefined,
          },
          ...next[refreshedTier],
        ];
        return next;
      });
      if (scheduled?.id && scheduled?.draft_text) {
        setDraftEdits((prev) => ({ ...prev, [scheduled.id as string]: scheduled.draft_text as string }));
      }
    } catch {
      setError("Failed to restore draft.");
    }
  };

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

    const loadNarrative = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch("/api/daily-narrative", { cache: "no-store", signal: controller.signal });
        clearTimeout(timeout);
        const data = (await res.json()) as { synopsis?: string };
        setSynopsis(data.synopsis ?? "No activity to summarize yet.");
      } catch {
        setSynopsis("No activity to summarize yet.");
      } finally {
        setLoadingNarrative(false);
      }
    };

    const loadTierProspects = async () => {
      const [prospectsRes, messagesRes, draftsRes, dismissedRes] = await Promise.all([
        client.from("prospects").select("id,name,tier,phone_number,vibe_notes"),
        client
          .from("messages")
          .select("id,body,created_at,direction,prospect_id")
          .order("created_at", { ascending: false })
          .limit(2000),
        client.from("scheduled_replies").select("id,draft_text,prospect_id").eq("status", "scheduled").limit(100),
        client
          .from("scheduled_replies")
          .select("id,draft_text,prospect_id,tier,dismissed_at,prospects(name)")
          .eq("status", "dismissed")
          .order("dismissed_at", { ascending: false })
          .limit(50),
      ]);

      const latestActivityAt = new Map<string, string>();
      const latestInbound = new Map<string, { body: string; at: string }>();
      for (const row of messagesRes.data ?? []) {
        const pid = row.prospect_id as string;
        if (!latestActivityAt.has(pid)) {
          latestActivityAt.set(pid, row.created_at as string);
        }
        if (row.direction === "inbound" && !latestInbound.has(pid)) {
          latestInbound.set(pid, { body: (row.body as string) || "", at: row.created_at as string });
        }
      }

      const draftByProspect = new Map<string, { id: string; text: string }>();
      for (const row of draftsRes.data ?? []) {
        const pid = row.prospect_id as string;
        if (!draftByProspect.has(pid)) {
          draftByProspect.set(pid, { id: row.id as string, text: row.draft_text as string });
        }
      }

      const result: Record<Tier, TierProspect[]> = { A: [], B: [], C: [] };
      const edits: Record<string, string> = {};

      for (const row of prospectsRes.data ?? []) {
        const tier = row.tier as Tier;
        if (!result[tier]) continue;
        const pid = String(row.id);
        const inbound = latestInbound.get(pid);
        const draft = draftByProspect.get(pid);
        const p: TierProspect = {
          id: pid,
          name: row.name ?? "Unknown",
          tier,
          phoneNumber: row.phone_number ?? undefined,
          vibeNotes: (row.vibe_notes as string) ?? undefined,
          lastInboundBody: inbound?.body,
          lastActivityAt: latestActivityAt.get(pid),
          draftId: draft?.id,
          draftText: draft?.text,
        };
        result[tier].push(p);
        if (draft) edits[draft.id] = draft.text;
      }

      const dismissed: DismissedDraft[] = (dismissedRes.data ?? []).map((row) => {
        const p = Array.isArray(row.prospects) ? row.prospects[0] : row.prospects;
        return {
          id: row.id as string,
          prospectId: row.prospect_id as string,
          prospectName: (p?.name as string) ?? "Unknown",
          tier: (row.tier as Tier) ?? "C",
          text: (row.draft_text as string) || undefined,
          draftId: row.id as string,
          dismissedAt: (row.dismissed_at as string) ?? new Date().toISOString(),
        };
      });

      setTierProspects(result);
      setDraftEdits(edits);
      setDismissedDrafts((prev) => {
        const localOnly = prev.filter((d) => !d.draftId);
        const map = new Map<string, DismissedDraft>();
        [...dismissed, ...localOnly].forEach((d) => map.set(d.id, d));
        return Array.from(map.values());
      });
      setRosterCount((prospectsRes.data ?? []).length);
    };

    const loadActivityCount = async () => {
      const { count } = await client
        .from("messages")
        .select("id", { count: "exact", head: true });
      setActivityCount(count ?? 0);
    };

    loadNarrative();
    loadTierProspects();
    loadActivityCount();
  }, []);

  const handleSaveDraft = async (draftId: string) => {
    const client = supabaseRef.current;
    if (!client) return;
    const text = draftEdits[draftId]?.trim();
    if (!text) return;
    const { error: updateError } = await client.from("scheduled_replies").update({ draft_text: text }).eq("id", draftId);
    if (updateError) { setError("Failed to update draft."); return; }
    setEditingDraftId(null);
  };

  const handleGenerateDraft = async (prospect: TierProspect) => {
    if (!isPro && rosterCount > FREE_ROSTER_LIMIT) {
      setPaywallFeature("AI draft generation");
      setShowPaywall(true);
      return;
    }
    setIsGenerating(prospect.id);
    setError(null);
    try {
      const res = await fetch("/api/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: prospect.tier,
          name: prospect.name,
          vibeNotes: prospect.vibeNotes || "",
          incomingText: prospect.lastInboundBody || "",
          prospectId: prospect.id,
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) {
        setError(data?.error ?? "Failed to generate draft.");
        return;
      }
      const draftText = data.draft ?? data.suggestedReply ?? data.autoReply ?? "";
      if (!draftText.trim()) {
        setError("No draft was generated for this message.");
        return;
      }
      const client = supabaseRef.current;
      if (!client) return;
      // DB compatibility: some schema versions only allow scheduled_replies.tier in ('B','C').
      const queueTier = prospect.tier === "A" ? "B" : prospect.tier;
      const insertPayloads: Array<Record<string, unknown>> = [
        // Prefer DB default status to avoid check-constraint mismatches.
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText },
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText, status: "scheduled" },
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText, status: "pending" },
      ];

      let insertResult:
        | { data: { id: string; draft_text: string } | null; error: { message?: string } | null }
        | null = null;
      for (const payload of insertPayloads) {
        const attempt = await client
          .from("scheduled_replies")
          .insert(payload)
          .select("id,draft_text")
          .single();
        insertResult = attempt as typeof insertResult;
        if (!attempt.error && attempt.data) break;
      }

      if (!insertResult || insertResult.error || !insertResult.data) {
        setError(insertResult?.error?.message ?? "Failed to save generated draft.");
        return;
      }

      const inserted = insertResult.data;
      if (inserted) {
        setTierProspects((prev) => {
          const next = { ...prev };
          next[prospect.tier] = next[prospect.tier].map((p) =>
            p.id === prospect.id ? { ...p, draftId: inserted.id as string, draftText: inserted.draft_text as string } : p
          );
          return next;
        });
        setDraftEdits((prev) => ({ ...prev, [inserted.id as string]: inserted.draft_text as string }));
      }
    } catch {
      setError("Failed to generate draft.");
    } finally {
      setIsGenerating(null);
    }
  };

  const handleSubscribe = async () => {
    setIsCheckoutLoading(true);
    setError(null);
    try {
      const base = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success_url: `${base}/home?success=1`, cancel_url: `${base}/home` }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? "Failed to start checkout."); return; }
      if (data.url) window.location.href = data.url;
    } catch { setError("Failed to start checkout."); } finally { setIsCheckoutLoading(false); }
  };

  const totalProspects = rosterCount;
  const hasProspects = totalProspects > 0;
  const hasActivity = activityCount > 0;
  const dismissedProspectIds = new Set(dismissedDrafts.map((d) => d.prospectId));

  const tierOrder: Tier[] = ["A", "B", "C"];
  const tierLabels: Record<Tier, string> = { A: "A Tier", B: "B Tier", C: "C Tier" };

  return (
    <div className="space-y-10">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-[0.35em]">STACK</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/roster"
            className="border border-[var(--rm-border)] px-4 py-2 text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text)]"
          >
            {rosterCount} Prospects
          </Link>
          {isPro ? (
            <span className="flex items-center gap-1.5 border border-emerald-500/40 px-4 py-2 text-xs uppercase tracking-[0.4em] text-emerald-400">
              <CheckCircle2 size={14} strokeWidth={1.5} />
              Pro
            </span>
          ) : (
            <button
              type="button"
              onClick={handleSubscribe}
              disabled={isCheckoutLoading}
              className="border border-[var(--rm-text)] bg-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.4em] text-[var(--rm-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCheckoutLoading ? "Loading…" : "Subscribe"}
            </button>
          )}
        </div>
      </header>

      {justUpgraded ? (
        <div className="flex items-center gap-2 border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
          <CheckCircle2 size={16} strokeWidth={1.5} />
          Welcome to STACK Pro — all features unlocked.
        </div>
      ) : null}

      {error ? (
        <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
          {error}
        </div>
      ) : null}

      {undoToast ? (
        <div className="fixed right-4 top-4 z-[70] border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-sm shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-[var(--rm-text-muted)]">Draft dismissed</span>
            <button
              type="button"
              onClick={handleUndoDismiss}
              className="text-xs uppercase tracking-[0.2em] text-blue-300 transition hover:text-blue-200"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setUndoToast(null)}
              className="text-[var(--rm-text-muted)]/70 transition hover:text-[var(--rm-text-muted)]"
              aria-label="Close toast"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      ) : null}

      {/* Onboarding: no prospects yet */}
      {!hasProspects ? (
        <section className="space-y-4 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6">
          <h2 className="text-lg font-semibold tracking-wide">Get started</h2>
          <p className="text-sm text-[var(--rm-text-muted)]">
            Add your first roster member free. Rank them A, B, or C tier. Add notes so the AI knows who they are.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/roster"
              className="flex items-center gap-2 border border-[var(--rm-text)] px-5 py-2.5 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)]"
            >
              <UserPlus size={14} strokeWidth={1.25} />
              Add to Roster
            </Link>
          </div>
        </section>
      ) : null}

      {/* Onboarding: has prospects but no activity */}
      {hasProspects && !hasActivity ? (
        <section className="space-y-4 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6">
          <h2 className="text-lg font-semibold tracking-wide">Next step</h2>
          <p className="text-sm text-[var(--rm-text-muted)]">
            Upload a screenshot of your texts or log an interaction. The AI uses your activity log to write better drafts.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/inbox"
              className="flex items-center gap-2 border border-blue-400/50 px-5 py-2.5 text-xs uppercase tracking-[0.3em] text-blue-400 transition hover:border-blue-400 hover:bg-blue-400/10"
            >
              <ImagePlus size={14} strokeWidth={1.25} />
              Upload Screenshot
            </Link>
            <Link
              href="/inbox"
              className="flex items-center gap-2 border border-[var(--rm-border)] px-5 py-2.5 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text)]"
            >
              Log Activity
            </Link>
          </div>
        </section>
      ) : null}

      {/* AI Summary — only show when there's actual data */}
      {hasProspects && hasActivity ? (
        <section className="space-y-2">
          <p className="text-xs uppercase tracking-[0.5em] text-[var(--rm-text-muted)]">AI Summary</p>
          <p className="text-sm text-[var(--rm-text-muted)]">
            {loadingNarrative ? "Generating summary..." : synopsis}
          </p>
        </section>
      ) : null}

      {/* Tier sections — only show when there are prospects */}
      {hasProspects ? (
        <>
          {tierOrder.map((tier) => {
            const visibleProspects = tierProspects[tier].filter((p) => !dismissedProspectIds.has(p.id));
            if (visibleProspects.length === 0) return null;
            return (
              <section key={tier} className="space-y-3">
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
                  {tierLabels[tier]}
                </p>
                <div className="space-y-3 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
                  {visibleProspects.map((prospect) => {
                    const draftId = prospect.draftId;
                    const currentDraft = draftId ? (draftEdits[draftId] ?? prospect.draftText ?? "") : "";
                    const isEditing = editingDraftId === draftId;
                    const generatingNoDraft = isGenerating === prospect.id;
                    const dismissKey = draftId || prospect.id;

                    return (
                      <div
                        key={prospect.id}
                        className={`relative border border-[var(--rm-border)] bg-[var(--rm-bg)] p-5 transition-opacity duration-200 ${
                          dismissingDraftIds[dismissKey] ? "opacity-0" : "opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold">{prospect.name}</p>
                          <div className="flex items-center gap-2">
                            {prospect.lastActivityAt ? (
                              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                                {formatRelativeTime(prospect.lastActivityAt)}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {prospect.lastInboundBody ? (
                          <p className="mt-2 text-xs text-slate-500">
                            &ldquo;{prospect.lastInboundBody.length > 80 ? `${prospect.lastInboundBody.slice(0, 80)}…` : prospect.lastInboundBody}&rdquo;
                          </p>
                        ) : null}

                        {draftId && currentDraft ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleDismissCard(prospect, draftId, currentDraft)}
                              className="absolute right-3 top-3 text-slate-400/25 transition hover:text-slate-300 hover:opacity-100 active:text-rose-300/90"
                              aria-label="Dismiss draft"
                              title="Dismiss"
                            >
                              <X size={14} strokeWidth={1.5} />
                            </button>
                            {isEditing ? (
                              <textarea
                                value={currentDraft}
                                onChange={(e) => setDraftEdits((prev) => ({ ...prev, [draftId]: e.target.value }))}
                                rows={3}
                                className="mt-2 w-full border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-2 text-xs text-[var(--rm-text)]"
                              />
                            ) : (
                              <p className="mt-3 text-sm text-[var(--rm-text)]">
                                {currentDraft}
                              </p>
                            )}
                            <div className="mt-4 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const body = encodeURIComponent(currentDraft);
                                  const urlH =
                                    prospect.phoneNumber
                                      ? `sms:${prospect.phoneNumber}?body=${body}`
                                      : `sms:?body=${body}`;
                                  window.location.href = urlH;
                                }}
                                className="flex shrink-0 items-center gap-2 rounded-full border border-slate-700 bg-slate-950/20 px-5 py-2 text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--rm-text)] transition hover:border-slate-500 hover:bg-slate-900/35"
                              >
                                <MessageSquare size={14} strokeWidth={1.25} className="opacity-90" />
                                TEXT
                              </button>
                              <div className="ml-auto flex shrink-0 items-center gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => shareDraftText(currentDraft, prospect.name)}
                                  className="rounded-full p-2 text-slate-500/70 transition hover:bg-slate-800/40 hover:text-slate-300"
                                  title="Share draft"
                                  aria-label="Share draft"
                                >
                                  <Share size={17} strokeWidth={1.2} />
                                </button>
                                {isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSaveDraft(draftId)}
                                    className="rounded-full p-2 text-slate-500/70 transition hover:bg-slate-800/40 hover:text-slate-300"
                                    title="Save draft"
                                    aria-label="Save draft"
                                  >
                                    <Save size={17} strokeWidth={1.2} />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEditingDraftId(draftId)}
                                    className="rounded-full p-2 text-slate-500/70 transition hover:bg-slate-800/40 hover:text-slate-300"
                                    title="Edit draft"
                                    aria-label="Edit draft"
                                  >
                                    <Edit2 size={17} strokeWidth={1.2} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleDismissCard(prospect)}
                              className="absolute right-3 top-3 text-slate-400/25 transition hover:text-slate-300 hover:opacity-100 active:text-rose-300/90"
                              aria-label="Dismiss prospect card"
                              title="Dismiss"
                            >
                              <X size={14} strokeWidth={1.5} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleGenerateDraft(prospect)}
                              disabled={generatingNoDraft}
                              className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text)] transition hover:border-[var(--rm-text)] disabled:opacity-60"
                            >
                              {generatingNoDraft ? "Generating..." : "Generate Draft"}
                            </button>
                            {prospect.phoneNumber ? (
                              <button
                                type="button"
                                onClick={() => { window.location.href = `sms:${prospect.phoneNumber}`; }}
                                className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text)] transition hover:border-[var(--rm-text)]"
                              >
                                <MessageSquare size={14} strokeWidth={1.25} />
                                Text
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </>
      ) : null}

      {dismissedDrafts.length > 0 ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setDismissedOpen((v) => !v)}
            className="flex w-full items-center justify-between border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-left text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
          >
            <span>Dismissed Drafts ({dismissedDrafts.length})</span>
            <span>{dismissedOpen ? "Hide" : "View"}</span>
          </button>
          {dismissedOpen ? (
            <div className="space-y-2 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
              {dismissedDrafts.map((draft) => (
                <div key={draft.id} className="flex items-start justify-between gap-3 border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {draft.prospectName}
                      <span className="ml-2 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                        {draft.tier}
                      </span>
                    </p>
                    {draft.text ? (
                      <p className="mt-1 text-xs text-[var(--rm-text-muted)]">{draft.text}</p>
                    ) : (
                      <p className="mt-1 text-xs text-[var(--rm-text-muted)]">Card dismissed from active feed.</p>
                    )}
                    
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreDismissed(draft)}
                    className="shrink-0 border border-slate-800 px-3 py-1.5 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)] transition hover:border-slate-500"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature={paywallFeature}
      />
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
