"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { ImagePlus, Lock, LogOut, MessageSquare, RefreshCw, Share, Sparkles, ThumbsUp, UserPlus, Wand2, X } from "lucide-react";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import PaywallModal from "../../../components/PaywallModal";
import { expectOutcomeAfterNextScreenshot } from "../../../lib/draft-outcome-analytics";
import { useProStatus } from "../../../lib/use-pro-status";
import {
  momentumPopoverLines,
  momentumTeaser,
  type MomentumContext,
} from "../../../lib/momentum-insight";
import { DEFAULT_REMIND_DAYS_BY_TIER } from "../../../lib/momentum-check-in";
import { clampNoteEngagementCredit, theirEngagementCreditFromNoteBody } from "../../../lib/note-engagement-signal";
import {
  buildProspectMomentumStateMap,
  coerceTier,
  computeThreadMomentum,
  computeThreadTrailSignals,
  isReactionMessageBody,
  remindByTierFromRulesRows,
  type Tier,
  type ThreadAgg,
} from "../../../lib/roster-portfolio-compute";
import { flattenTierProspects, isAtGhostingRisk } from "../../../lib/portfolio-stats";
import { FREE_AI_DRAFTS, FREE_MESSAGE_LOG_CAP } from "../../../lib/free-tier";

const PRO_REGEN_LIMIT = 5;
const REGEN_STORAGE_KEY = "stack_draft_regen_counts_v1";

const ELITE_TONES = [
  { id: "balanced", label: "Balanced" },
  { id: "playful", label: "Playful" },
  { id: "dominant", label: "Dominant" },
  { id: "warm", label: "Warm" },
  { id: "minimal", label: "Minimal" },
] as const;

type EliteToneId = (typeof ELITE_TONES)[number]["id"];

type TierProspect = {
  id: string;
  name: string;
  tier: Tier;
  phoneNumber?: string;
  vibeNotes?: string;
  lastInboundBody?: string;
  /** Latest outbound text body (when you texted last, show this instead of their bubble as context). */
  lastOutboundTextBody?: string;
  /** Most recent log line (any type / direction), for the time badge */
  lastActivityAt?: string;
  draftId?: string;
  draftText?: string;
  /** 0–100 thread health for this person (log + screenshot uploads grow it). */
  momentum?: number;
  momentumContext?: MomentumContext;
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

function loadRegenMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REGEN_STORAGE_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

export default function HomePage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const remindByTierRef = React.useRef<Record<Tier, number>>({ ...DEFAULT_REMIND_DAYS_BY_TIER });
  const [tierProspects, setTierProspects] = React.useState<Record<Tier, TierProspect[]>>({ A: [], B: [], C: [] });
  const [rosterCount, setRosterCount] = React.useState(0);
  const [activityCount, setActivityCount] = React.useState(0);
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});
  const [shareTip, setShareTip] = React.useState<{ prospectId: string; message: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState<string | null>(null);
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [paywallFeature, setPaywallFeature] = React.useState<string | undefined>(undefined);
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const [draftsEverGenerated, setDraftsEverGenerated] = React.useState(0);
  const [dismissingDraftIds, setDismissingDraftIds] = React.useState<Record<string, boolean>>({});
  const [undoToast, setUndoToast] = React.useState<UndoToast | null>(null);
  const [dismissedDrafts, setDismissedDrafts] = React.useState<DismissedDraft[]>([]);
  const [dismissedOpen, setDismissedOpen] = React.useState(false);
  const [quickTouchingId, setQuickTouchingId] = React.useState<string | null>(null);
  const [touchBaseToast, setTouchBaseToast] = React.useState<string | null>(null);
  const [regenByDraftId, setRegenByDraftId] = React.useState<Record<string, number>>({});
  const [draftToneByProspect, setDraftToneByProspect] = React.useState<Record<string, EliteToneId>>({});
  const [momentumPopoverId, setMomentumPopoverId] = React.useState<string | null>(null);
  const messagesEventTypeRef = React.useRef(true);
  const { isPro, isElite, checked, markPro } = useProStatus();
  const searchParams = useSearchParams();
  const router = useRouter();

  React.useEffect(() => {
    setRegenByDraftId(loadRegenMap());
  }, []);

  React.useEffect(() => {
    const up = searchParams.get("upgrade");
    if (up !== "1" || !checked) return;
    if (!isPro) {
      setPaywallFeature("STACK Pro");
      setShowPaywall(true);
    }
    router.replace("/home", { scroll: false });
  }, [searchParams, checked, isPro, router]);

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
      .then((data: { pro?: boolean; elite?: boolean; error?: string }) => {
        if (data.pro) {
          markPro({ elite: data.elite === true });
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

  const shareDraftText = async (text: string, prospectName: string, prospectId: string) => {
    setShareTip(null);
    try {
      await navigator.clipboard.writeText(text);
      setShareTip({
        prospectId,
        message: "Copied — open Instagram (or any app) and paste in a DM.",
      });
      window.setTimeout(() => {
        setShareTip((prev) => (prev?.prospectId === prospectId ? null : prev));
      }, 4000);
    } catch {
      setError("Could not copy this draft to the clipboard.");
      return;
    }
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          text,
          title: `Draft for ${prospectName}`,
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
    }
  };

  React.useEffect(() => {
    if (!undoToast) return;
    const t = setTimeout(() => setUndoToast(null), 6000);
    return () => clearTimeout(t);
  }, [undoToast]);

  React.useEffect(() => {
    if (!momentumPopoverId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMomentumPopoverId(null);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      const root = t.closest("[data-momentum-root]");
      if (root?.getAttribute("data-momentum-root") === momentumPopoverId) return;
      setMomentumPopoverId(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [momentumPopoverId]);

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

    // X = "off my stack for now" — briefing ignores them until new inbound or Restore (not "I texted them").
    void fetch("/api/clear-prospect-briefing", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prospect_id: prospect.id }),
    });

    if (!draftId) return;

    // If there is a draft, mark it dismissed server-side.
    try {
      const res = await fetch("/api/dismiss-draft", {
        method: "POST",
        credentials: "same-origin",
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
        credentials: "same-origin",
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
      setDismissedDrafts((prev) => prev.filter((d) => d.prospectId !== toast.prospectId));
      void fetch("/api/unclear-prospect-briefing", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: toast.prospectId }),
      });
    } catch {
      setError("Failed to undo dismissal.");
    }
  };

  const handleRestoreDismissed = async (draft: DismissedDraft) => {
    try {
      if (draft.draftId) {
        const res = await fetch("/api/undo-dismiss-draft", {
          method: "POST",
          credentials: "same-origin",
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
            .select("body,created_at,direction,event_type")
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
        setDismissedDrafts((prev) => prev.filter((d) => d.prospectId !== draft.prospectId));
        return;
      }

      const refreshedTier = coerceTier(prospectRow.tier, coerceTier(draft.tier));
      const msgRows = inboundRows ?? [];
      const scheduled = (scheduledRows ?? [])[0];

      const restoreAgg: ThreadAgg = {
        inbound: 0,
        outbound: 0,
        inboundText: 0,
        inboundNoteCredit: 0,
        outboundText: 0,
        noteCount: 0,
        touchBaseCount: 0,
        total: 0,
      };
      let restoreLastTextOut: string | undefined;
      let restoreLastOutBody: string | undefined;
      let restoreLastIn: string | undefined;
      let restoreLastInBody: string | undefined;
      let restoreLatestDir: "inbound" | "outbound" | undefined;
      let restoreLatestAt: string | undefined;
      const isoMs = (iso: string) => new Date(iso).getTime();
      for (let i = 0; i < msgRows.length; i++) {
        const r = msgRows[i];
        const at = r.created_at as string;
        const isInbound = String(r.direction ?? "").toLowerCase() === "inbound";
        const isNote = (r.event_type as string) === "note";
        const bodyStr = String(r.body ?? "");
        const isReaction = isReactionMessageBody(bodyStr);
        restoreAgg.total += 1;
        if (isInbound) {
          restoreAgg.inbound += 1;
          if (!isReaction) restoreAgg.inboundText += 1;
          if (!isReaction) {
            if (!restoreLastIn || isoMs(at) > isoMs(restoreLastIn)) {
              restoreLastIn = at;
              restoreLastInBody = bodyStr;
            }
          }
        } else {
          restoreAgg.outbound += 1;
          if (!isNote && !isReaction) {
            restoreAgg.outboundText += 1;
            if (!restoreLastTextOut || isoMs(at) > isoMs(restoreLastTextOut)) {
              restoreLastTextOut = at;
              restoreLastOutBody = bodyStr;
            }
          }
          if (bodyStr.includes("Touched base")) restoreAgg.touchBaseCount += 1;
        }
        if (isNote) {
          restoreAgg.noteCount += 1;
          const add = theirEngagementCreditFromNoteBody(bodyStr);
          if (add > 0) {
            restoreAgg.inboundNoteCredit = clampNoteEngagementCredit(
              restoreAgg.inboundNoteCredit + add
            );
          }
        }
      }
      if (restoreLastIn && restoreLastTextOut) {
        const msIn = isoMs(restoreLastIn);
        const msOut = isoMs(restoreLastTextOut);
        if (msIn > msOut) {
          restoreLatestDir = "inbound";
          restoreLatestAt = restoreLastIn;
        } else if (msOut > msIn) {
          restoreLatestDir = "outbound";
          restoreLatestAt = restoreLastTextOut;
        } else {
          restoreLatestDir = "inbound";
          restoreLatestAt = restoreLastIn;
        }
      } else if (restoreLastIn) {
        restoreLatestDir = "inbound";
        restoreLatestAt = restoreLastIn;
      } else if (restoreLastTextOut) {
        restoreLatestDir = "outbound";
        restoreLatestAt = restoreLastTextOut;
      }
      const restoreTrail = computeThreadTrailSignals(
        (msgRows as Array<{ body?: string | null; created_at: string; direction: string; event_type?: string | null; prospect_id?: string }>).map(
          (r) => ({
            body: r.body,
            created_at: r.created_at,
            direction: String(r.direction ?? ""),
            prospect_id: String(r.prospect_id ?? draft.prospectId),
            event_type: r.event_type,
          })
        )
      );
      const restoreRemind = remindByTierRef.current[refreshedTier];
      const restoreNow = new Date();
      const restoreMomentum =
        restoreAgg.total > 0
          ? computeThreadMomentum(restoreAgg, refreshedTier, {
              lastOutboundAt: restoreLastTextOut,
              remindAfterDays: restoreRemind,
              now: restoreNow,
              latestDirection: restoreLatestDir,
              lastInboundPreview: restoreLastInBody,
              trailSignals: restoreTrail,
            })
          : 0;
      const restoreMomentumCtx: MomentumContext | undefined =
        restoreAgg.total > 0
          ? {
              tier: refreshedTier,
              remindAfterDays: restoreRemind,
              inbound: restoreAgg.inbound,
              outbound: restoreAgg.outbound,
              inboundText: restoreAgg.inboundText,
              inboundNoteCredit: restoreAgg.inboundNoteCredit,
              outboundText: restoreAgg.outboundText,
              total: restoreAgg.total,
              noteCount: restoreAgg.noteCount,
              touchBaseCount: restoreAgg.touchBaseCount,
              lastInboundAt: restoreLastIn,
              lastOutboundAt: restoreLastTextOut,
              lastInboundPreview: restoreLastInBody,
              lastOutboundPreview: restoreLastOutBody,
              latestDirection: restoreLatestDir,
              latestAt: restoreLatestAt,
              inboundReactionCount: restoreTrail.inboundReactionCount,
              outboundRunSinceTheirText: restoreTrail.outboundRunSinceTheirText,
            }
          : undefined;

      setDismissedDrafts((prev) => prev.filter((d) => d.prospectId !== draft.prospectId));
      void fetch("/api/unclear-prospect-briefing", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospect_id: draft.prospectId }),
      });
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
            lastInboundBody: restoreLastInBody,
            lastOutboundTextBody: restoreLastOutBody,
            lastActivityAt: (msgRows[0]?.created_at as string) ?? undefined,
            draftId: (scheduled?.id as string) ?? undefined,
            draftText: (scheduled?.draft_text as string) ?? undefined,
            momentum: restoreMomentum,
            momentumContext: restoreMomentumCtx,
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

    const loadTierProspects = async () => {
      const [prospectsRes, messagesRes, draftsRes, dismissedRes, rulesRes] = await Promise.all([
        client.from("prospects").select("id,name,tier,phone_number,vibe_notes"),
        client
          .from("messages")
          .select("id,body,created_at,direction,prospect_id,event_type")
          .order("created_at", { ascending: false })
          .limit(2000),
        client.from("scheduled_replies").select("id,draft_text,prospect_id").eq("status", "scheduled").limit(100),
        client
          .from("scheduled_replies")
          .select("id,draft_text,prospect_id,tier,dismissed_at,prospects(name)")
          .eq("status", "dismissed")
          .order("dismissed_at", { ascending: false })
          .limit(50),
        client.from("tier_rules").select("tier,remind_after_days"),
      ]);

      const remindByTier = remindByTierFromRulesRows(rulesRes.data ?? []);
      remindByTierRef.current = remindByTier;

      const now = new Date();
      const momentumByProspect = buildProspectMomentumStateMap(
        prospectsRes.data ?? [],
        messagesRes.data ?? [],
        remindByTier,
        now
      );

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
        const tier = coerceTier(row.tier);
        if (!result[tier]) continue;
        const pid = String(row.id);
        const draft = draftByProspect.get(pid);
        const st = momentumByProspect.get(pid);
        const p: TierProspect = {
          id: pid,
          name: row.name ?? "Unknown",
          tier,
          phoneNumber: row.phone_number ?? undefined,
          vibeNotes: (row.vibe_notes as string) ?? undefined,
          lastInboundBody: st?.lastInboundBody,
          lastOutboundTextBody: st?.lastOutboundTextBody,
          lastActivityAt: st?.lastActivityAt,
          draftId: draft?.id,
          draftText: draft?.text,
          momentum: st?.momentum ?? 0,
          momentumContext: st?.momentumContext,
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
      const rosterIds = new Set((prospectsRes.data ?? []).map((row) => String(row.id)));
      setDismissedDrafts((prev) => {
        const localOnly = prev.filter((d) => !d.draftId);
        const combined = [...dismissed, ...localOnly].filter((d) => rosterIds.has(d.prospectId));
        const byProspect = new Map<string, DismissedDraft>();
        for (const d of combined) {
          const cur = byProspect.get(d.prospectId);
          if (!cur || (d.draftId && !cur.draftId)) {
            byProspect.set(d.prospectId, d);
          }
        }
        return Array.from(byProspect.values());
      });
      setRosterCount((prospectsRes.data ?? []).length);
    };

    const loadActivityCount = async () => {
      const { count } = await client
        .from("messages")
        .select("id", { count: "exact", head: true });
      setActivityCount(count ?? 0);
    };

    const loadDraftsGenerated = async () => {
      const { count } = await client
        .from("scheduled_replies")
        .select("id", { count: "exact", head: true });
      setDraftsEverGenerated(count ?? 0);
    };

    loadTierProspects();
    loadActivityCount();
    loadDraftsGenerated();
  }, []);

  const handleTouchedBase = async (prospect: TierProspect, draftSummary?: string) => {
    const client = supabaseRef.current;
    if (!client) return;
    if (checked && !isPro && activityCount >= FREE_MESSAGE_LOG_CAP) {
      setPaywallFeature("Unlimited logging");
      setShowPaywall(true);
      return;
    }
    setQuickTouchingId(prospect.id);
    setError(null);
    const insertPayload: Record<string, unknown> = {
      prospect_id: prospect.id,
      direction: "outbound",
      body: "Touched base",
    };
    if (messagesEventTypeRef.current) insertPayload.event_type = "note";

    let { error: insertError } = await client.from("messages").insert(insertPayload);
    if (insertError?.message?.includes("event_type")) {
      messagesEventTypeRef.current = false;
      delete insertPayload.event_type;
      const retry = await client.from("messages").insert(insertPayload);
      insertError = retry.error;
    }

    if (insertError) {
      setError(insertError.message);
      setQuickTouchingId(null);
      return;
    }

    const dismissKey = prospect.draftId || prospect.id;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([12, 45, 12]);
    }

    setDismissingDraftIds((prev) => ({ ...prev, [dismissKey]: true }));

    window.setTimeout(() => {
      const dismissedAt = new Date().toISOString();
      setDismissedDrafts((prev) => [
        {
          id: dismissKey,
          prospectId: prospect.id,
          prospectName: prospect.name,
          tier: prospect.tier,
          text: draftSummary ?? prospect.draftText,
          draftId: prospect.draftId,
          dismissedAt,
        },
        ...prev.filter((d) => d.id !== dismissKey),
      ]);

      if (prospect.draftId) {
        void fetch("/api/dismiss-draft", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draft_id: prospect.draftId }),
        })
          .then((res) => {
            if (!res.ok) {
              setError("Logged touch, but could not sync hidden draft to the server.");
            }
          })
          .catch(() => {
            setError("Logged touch, but could not sync hidden draft to the server.");
          });
      }

      setActivityCount((c) => c + 1);
      setQuickTouchingId(null);
      setDismissingDraftIds((prev) => {
        const next = { ...prev };
        delete next[dismissKey];
        return next;
      });
      setTouchBaseToast("Interaction Logged.");
      window.setTimeout(() => setTouchBaseToast(null), 1000);
    }, 300);
  };

  const bumpRegenCount = React.useCallback((draftId: string) => {
    setRegenByDraftId((prev) => {
      const next = { ...prev, [draftId]: (prev[draftId] ?? 0) + 1 };
      try {
        window.localStorage.setItem(REGEN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const handleGenerateDraft = async (
    prospect: TierProspect,
    opts?: { regenerate?: boolean }
  ) => {
    const regenerating = Boolean(opts?.regenerate && prospect.draftId);
    if (!regenerating && !isPro && draftsEverGenerated >= FREE_AI_DRAFTS) {
      setPaywallFeature("AI drafts");
      setShowPaywall(true);
      return;
    }
    if (
      regenerating &&
      prospect.draftId &&
      isPro &&
      !isElite &&
      (regenByDraftId[prospect.draftId] ?? 0) >= PRO_REGEN_LIMIT
    ) {
      setError(
        "Pro includes 5 regenerations per draft. Elite adds unlimited regenerations and tone styles."
      );
      return;
    }
    setIsGenerating(prospect.id);
    setError(null);
    try {
      const toneStyle = isElite
        ? draftToneByProspect[prospect.id] ?? "balanced"
        : undefined;
      const youTextedLast = prospect.momentumContext?.latestDirection === "outbound";
      const res = await fetch("/api/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          tier: prospect.tier,
          name: prospect.name,
          vibeNotes: prospect.vibeNotes || "",
          incomingText: youTextedLast ? "" : prospect.lastInboundBody || "",
          ...(youTextedLast ? { youTextedLast: true } : {}),
          prospectId: prospect.id,
          ...(toneStyle ? { toneStyle } : {}),
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

      if (regenerating && prospect.draftId) {
        const { data: updated, error: upErr } = await client
          .from("scheduled_replies")
          .update({ draft_text: draftText })
          .eq("id", prospect.draftId)
          .select("id,draft_text")
          .single();
        if (upErr || !updated) {
          setError(upErr?.message ?? "Failed to update draft.");
          return;
        }
        const id = String(updated.id);
        const text = String(updated.draft_text ?? "");
        setTierProspects((prev) => {
          const next = { ...prev };
          next[prospect.tier] = next[prospect.tier].map((p) =>
            p.id === prospect.id ? { ...p, draftId: id, draftText: text } : p
          );
          return next;
        });
        setDraftEdits((prev) => ({ ...prev, [id]: text }));
        expectOutcomeAfterNextScreenshot(id, prospect.id);
        if (isPro && !isElite) bumpRegenCount(id);
        return;
      }

      // DB compatibility: some schema versions only allow scheduled_replies.tier in ('B','C').
      const queueTier = prospect.tier === "A" ? "B" : prospect.tier;
      const insertPayloads: Array<Record<string, unknown>> = [
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText },
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText, status: "scheduled" },
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText, status: "pending" },
      ];

      type ScheduledDraftRow = { id: string; draft_text: string };
      let insertResult: PostgrestSingleResponse<ScheduledDraftRow> | undefined = undefined;

      for (const payload of insertPayloads) {
        const attempt: PostgrestSingleResponse<ScheduledDraftRow> = await client
          .from("scheduled_replies")
          .insert(payload)
          .select("id,draft_text")
          .single();
        insertResult = attempt;
        if (!attempt.error && attempt.data) break;
      }

      const row = insertResult?.data;
      if (!row) {
        setError(insertResult?.error?.message ?? "Failed to save generated draft.");
        return;
      }

      const inserted = { id: String(row.id), draftText: String(row.draft_text ?? "") };
      setTierProspects((prev) => {
        const next = { ...prev };
        next[prospect.tier] = next[prospect.tier].map((p) =>
          p.id === prospect.id ? { ...p, draftId: inserted.id, draftText: inserted.draftText } : p
        );
        return next;
      });
      setDraftEdits((prev) => ({ ...prev, [inserted.id]: inserted.draftText }));
      setDraftsEverGenerated((n) => n + 1);
      expectOutcomeAfterNextScreenshot(inserted.id, prospect.id);
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
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "yearly" }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `Checkout failed (${res.status}). Check Stripe env vars on Vercel.`);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("No checkout URL returned. Check STRIPE_PRICE_ID on Vercel.");
      }
    } catch (err) {
      setError(`Checkout error: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  const totalProspects = rosterCount;
  const hasProspects = totalProspects > 0;
  const hasActivity = activityCount > 0;
  const dismissedProspectIds = new Set(dismissedDrafts.map((d) => d.prospectId));

  const tierOrder: Tier[] = ["A", "B", "C"];
  const tierLabels: Record<Tier, string> = {
    A: "Top picks (A)",
    B: "In the mix (B)",
    C: "Casual (C)",
  };
  const tierPlain: Record<Tier, string> = { A: "Top picks", B: "In the mix", C: "Casual" };

  const aListWaitingOnYou = React.useMemo(
    () => flattenTierProspects(tierProspects).filter((p) => isAtGhostingRisk(p)).length,
    [tierProspects]
  );

  return (
    <div className="space-y-3 sm:space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-2 sm:gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[0.35em] sm:text-3xl">STACK</h1>
          <p className="mt-1 text-[11px] leading-snug text-[var(--rm-text-muted)] sm:text-xs">
            Roster + logged texts → AI drafts. Not a calendar or birthday book.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:gap-3">
          <Link
            href="/roster"
            className="border border-[var(--rm-border)] px-2.5 py-1 text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text)] sm:px-4 sm:py-2 sm:text-xs sm:tracking-[0.4em]"
          >
            {rosterCount} {rosterCount === 1 ? "person" : "people"}
          </Link>

          {isPro ? (
            <span
              className={`flex items-center gap-1 border px-2 py-0.5 text-[9px] uppercase tracking-[0.3em] sm:gap-1.5 sm:px-3 sm:py-1.5 sm:text-[10px] sm:tracking-[0.35em] ${
                isElite
                  ? "border-amber-500/45 text-amber-300/95"
                  : "border-emerald-500/40 text-emerald-400"
              }`}
            >
              <Sparkles size={10} strokeWidth={1.5} />
              {isElite ? "Elite" : "Pro"}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowPaywall(true)}
              className="text-[10px] uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-300"
            >
              Upgrade
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              const { createBrowserSupabase } = await import("../../../lib/supabase/browser");
              await createBrowserSupabase().auth.signOut();
              window.location.href = "/login";
            }}
            className="text-[var(--rm-text-muted)]/40 transition hover:text-[var(--rm-text-muted)]"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut size={15} strokeWidth={1.25} />
          </button>
        </div>
      </header>

      {error ? (
        <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
          {error}
        </div>
      ) : null}

      {touchBaseToast ? (
        <div className="fixed bottom-6 left-1/2 z-[75] -translate-x-1/2 border border-emerald-500/30 bg-[var(--rm-bg-elevated)] px-4 py-2.5 text-sm text-emerald-100/95 shadow-lg">
          {touchBaseToast}
        </div>
      ) : null}

      {undoToast ? (
        <div className="fixed right-4 top-4 z-[70] border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-sm shadow-lg">
          <div className="flex items-center gap-3">
            <span className="text-[var(--rm-text-muted)]">Draft hidden</span>
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

      {/* Onboarding step 1: no prospects yet */}
      {!hasProspects ? (
        <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-6">
          <h2 className="text-base font-semibold tracking-wide">Add who you&apos;re texting</h2>
          <p className="mt-1.5 text-sm text-[var(--rm-text-muted)]">
            Use the <strong className="font-medium text-[var(--rm-text)]">People</strong> tab. Mark who matters
            most as A and who&apos;s casual as C — the AI matches your tone to that.
          </p>
          <Link
            href="/roster"
            className="mt-4 flex w-fit items-center gap-2 rounded-full border border-[var(--rm-text)] px-5 py-2.5 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)]"
          >
            <UserPlus size={13} strokeWidth={1.25} />
            Add them
          </Link>
        </section>
      ) : null}

      {/* Onboarding step 2: has prospects but no activity */}
      {hasProspects && !hasActivity ? (
        <section className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 sm:p-6">
          <h2 className="text-base font-semibold tracking-wide">Add something from your texts</h2>
          <p className="mt-1.5 text-sm text-[var(--rm-text-muted)]">
            Open <strong className="font-medium text-[var(--rm-text)]">Texts</strong> and either upload a
            screenshot or type a short note. Without that, the AI is guessing.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/inbox"
              className="flex items-center gap-2 rounded-full border border-[var(--rm-text)] px-5 py-2.5 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)]"
            >
              <ImagePlus size={13} strokeWidth={1.25} />
              Open Texts tab
            </Link>
          </div>
        </section>
      ) : null}

      {/* Onboarding step 3: has activity but hasn't generated a draft yet */}
      {hasProspects && hasActivity && !isPro && draftsEverGenerated === 0 ? (
        <section className="border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-6">
          <h2 className="text-base font-semibold tracking-wide">Try one AI reply (free)</h2>
          <p className="mt-1.5 text-sm text-[var(--rm-text-muted)]">
            Below, tap <span className="text-[var(--rm-text)]">Generate Draft</span> on someone. First one is
            free.
          </p>
        </section>
      ) : null}

      {hasProspects && hasActivity && aListWaitingOnYou > 0 ? (
        <div className="rounded-lg border border-amber-500/45 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="text-amber-50/95">
            {aListWaitingOnYou === 1
              ? "Someone on your A-list texted last — you haven’t replied yet. Scroll down to them first."
              : `${aListWaitingOnYou} people on your A-list texted last — you haven’t replied yet. Scroll down and work through them.`}
          </p>
          <Link
            href="#stack-roster-cards"
            className="mt-2 inline-block text-xs font-medium text-amber-200 underline underline-offset-2"
          >
            Jump to the list
          </Link>
        </div>
      ) : null}

      {hasProspects && hasActivity ? (
        <p className="text-center text-[11px] text-[var(--rm-text-muted)] sm:text-left">
          <Link
            href="/metrics"
            className="text-amber-400/90 underline decoration-amber-500/35 underline-offset-2 transition hover:text-amber-300"
          >
            Pulse — roster stats &amp; briefing →
          </Link>
        </p>
      ) : null}

      {/* Tier sections — only show when there are prospects */}
      {hasProspects ? (
        <div id="stack-roster-cards" className="space-y-3 sm:space-y-6">
          {tierOrder.map((tier) => {
            const visibleProspects = tierProspects[tier].filter((p) => !dismissedProspectIds.has(p.id));
            if (visibleProspects.length === 0) return null;
            return (
              <section key={tier} className="space-y-1 sm:space-y-3">
                <p className="text-[10px] uppercase tracking-[0.32em] text-[var(--rm-text-muted)] sm:text-xs sm:tracking-[0.4em]">
                  {tierLabels[tier]}
                </p>
                <div className="space-y-1.5 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-2 sm:space-y-3 sm:p-4">
                  {visibleProspects.map((prospect) => {
                    const draftId = prospect.draftId;
                    const currentDraft = draftId ? (draftEdits[draftId] ?? prospect.draftText ?? "") : "";
                    const generatingNoDraft = isGenerating === prospect.id;
                    const dismissKey = draftId || prospect.id;
                    const regenUsed = draftId ? (regenByDraftId[draftId] ?? 0) : 0;
                    const regenBlocked =
                      isPro && !isElite && Boolean(draftId) && regenUsed >= PRO_REGEN_LIMIT;
                    const youTextedLast = prospect.momentumContext?.latestDirection === "outbound";
                    const clipCtx = (s: string) => (s.length > 80 ? `${s.slice(0, 80)}…` : s);
                    const stackQuoteYou =
                      youTextedLast && Boolean(prospect.lastOutboundTextBody?.trim());
                    const stackQuoteYouPlain = youTextedLast && !stackQuoteYou;
                    const stackQuoteThem = !youTextedLast && Boolean(prospect.lastInboundBody?.trim());
                    const hasStackContextQuote = stackQuoteYou || stackQuoteYouPlain || stackQuoteThem;

                    return (
                      <div
                        key={prospect.id}
                        className={`relative border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2.5 transition-opacity duration-300 ease-out sm:p-5 ${
                          dismissingDraftIds[dismissKey] ? "pointer-events-none opacity-0" : "opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                            <p className="min-w-0 truncate text-sm font-semibold">{prospect.name}</p>
                            <div className="relative shrink-0" data-momentum-root={prospect.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  setMomentumPopoverId((id) => (id === prospect.id ? null : prospect.id))
                                }
                                className={`flex max-w-[10.5rem] items-center gap-1 rounded-full border px-2 py-1 text-left transition hover:bg-[var(--rm-bg-elevated)] ${
                                  (prospect.momentum ?? 0) > 0
                                    ? "border-amber-500/45 text-amber-100/95"
                                    : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
                                }`}
                                aria-expanded={momentumPopoverId === prospect.id}
                                aria-haspopup="dialog"
                                title="Momentum (0–100): how well you’re keeping up on this chat"
                              >
                                <Wand2 size={12} strokeWidth={1.5} className="shrink-0 text-amber-400/90" aria-hidden />
                                <span className="flex min-w-0 flex-col gap-0.5">
                                  <span className="text-[12px] font-semibold tabular-nums leading-none tracking-tight">
                                    {prospect.momentum ?? 0}
                                  </span>
                                  <span className="line-clamp-2 text-[8px] font-medium leading-snug text-[var(--rm-text-muted)] normal-case tracking-normal">
                                    {momentumTeaser(
                                      prospect.name,
                                      prospect.momentum ?? 0,
                                      prospect.momentumContext
                                    )}
                                  </span>
                                </span>
                              </button>
                              {momentumPopoverId === prospect.id ? (
                                <div
                                  role="dialog"
                                  aria-label={`Momentum for ${prospect.name}`}
                                  className="absolute right-0 top-[calc(100%+0.35rem)] z-[80] w-[min(19rem,calc(100vw-2.5rem))] border border-amber-500/30 bg-[var(--rm-bg-elevated)] p-3 text-left shadow-xl"
                                >
                                  <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-amber-400/95">
                                    Momentum · {prospect.momentum ?? 0}/100 · {tierPlain[prospect.tier]}
                                  </p>
                                  <div className="mt-2 space-y-2.5 text-[11px] leading-snug text-[var(--rm-text-muted)] normal-case tracking-normal">
                                    {momentumPopoverLines(
                                      prospect.name,
                                      prospect.momentum ?? 0,
                                      prospect.momentumContext
                                    ).map((para, i) => (
                                      <p key={i}>{para}</p>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {prospect.lastActivityAt ? (
                              <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                                {formatRelativeTime(prospect.lastActivityAt)}
                              </span>
                            ) : (
                              <span className="text-[10px] uppercase tracking-[0.15em] text-[var(--rm-text-muted)]/50">
                                —
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                draftId
                                  ? handleDismissCard(prospect, draftId, currentDraft)
                                  : handleDismissCard(prospect)
                              }
                              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-600/60 bg-slate-900/60 text-slate-400 transition hover:border-slate-500 hover:bg-slate-800/80 hover:text-slate-100 active:text-rose-300"
                              aria-label="Hide card"
                              title="Hide card — open Hidden cards below to bring back"
                            >
                              <X size={14} strokeWidth={1.5} />
                            </button>
                          </div>
                        </div>

                        {isElite ? (
                          <div className="mt-2 border-t border-[var(--rm-border)]/50 pt-2">
                            <p className="mb-1 text-[8px] uppercase tracking-[0.2em] text-slate-500">
                              Tone style
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {ELITE_TONES.map((t) => {
                                const active =
                                  (draftToneByProspect[prospect.id] ?? "balanced") === t.id;
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() =>
                                      setDraftToneByProspect((prev) => ({
                                        ...prev,
                                        [prospect.id]: t.id,
                                      }))
                                    }
                                    className={`rounded-full px-2 py-0.5 text-[8px] uppercase tracking-[0.08em] transition ${
                                      active
                                        ? "border border-amber-500/50 bg-amber-500/10 text-amber-100/90"
                                        : "border border-transparent text-slate-500 hover:border-slate-600/50 hover:text-slate-300"
                                    }`}
                                  >
                                    {t.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        {draftId && currentDraft ? (
                          <>
                            {stackQuoteYou ? (
                              <p className="mt-1.5 text-[11px] leading-snug text-slate-500 sm:mt-2 sm:text-xs sm:leading-normal">
                                <span className="text-slate-600">You · </span>
                                &ldquo;
                                {clipCtx(prospect.lastOutboundTextBody!)}
                                &rdquo;
                              </p>
                            ) : stackQuoteYouPlain ? (
                              <p className="mt-1.5 text-[11px] leading-snug text-slate-500 sm:mt-2 sm:text-xs sm:leading-normal">
                                You texted last.
                              </p>
                            ) : stackQuoteThem ? (
                              <p className="mt-1.5 text-[11px] leading-snug text-slate-500 sm:mt-2 sm:text-xs sm:leading-normal">
                                &ldquo;{clipCtx(prospect.lastInboundBody!)}&rdquo;
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-col gap-2 sm:mt-3 sm:flex-row sm:items-start sm:gap-3">
                              <p className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--rm-text)]">
                                <span className="text-[1.05em]">{currentDraft}</span>
                              </p>
                              <div className="flex shrink-0 flex-col items-end gap-1.5">
                                <div className="flex max-w-full flex-row flex-wrap justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleGenerateDraft(prospect, { regenerate: true })}
                                    disabled={isGenerating === prospect.id || regenBlocked}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700/45 bg-slate-950/35 text-slate-400 transition hover:border-slate-500/55 hover:bg-slate-800/55 hover:text-slate-100 disabled:pointer-events-none disabled:opacity-30"
                                    title={
                                      regenBlocked
                                        ? `Pro: ${PRO_REGEN_LIMIT} regenerations per draft — Elite is unlimited`
                                        : "Regenerate draft"
                                    }
                                    aria-label="Regenerate draft"
                                  >
                                    <RefreshCw
                                      size={15}
                                      strokeWidth={1.35}
                                      className={isGenerating === prospect.id ? "animate-spin" : ""}
                                    />
                                  </button>
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
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700/45 bg-slate-950/35 text-slate-400 transition hover:border-slate-500/55 hover:bg-slate-800/55 hover:text-slate-100"
                                    title="Open Messages with this draft"
                                    aria-label="Open Messages with draft"
                                  >
                                    <MessageSquare size={15} strokeWidth={1.25} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTouchedBase(prospect, currentDraft)}
                                    disabled={quickTouchingId === prospect.id}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700/45 bg-slate-950/35 text-slate-400 transition hover:border-slate-500/55 hover:bg-slate-800/55 hover:text-slate-100 active:scale-95 disabled:pointer-events-none disabled:opacity-30"
                                    title="Log chat — touched base & hide card"
                                    aria-label="Log chat"
                                  >
                                    {quickTouchingId === prospect.id ? (
                                      <RefreshCw size={14} strokeWidth={1.35} className="animate-spin" />
                                    ) : (
                                      <ThumbsUp size={15} strokeWidth={1.2} />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => shareDraftText(currentDraft, prospect.name, prospect.id)}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700/45 bg-slate-950/35 text-slate-400 transition hover:border-slate-500/55 hover:bg-slate-800/55 hover:text-slate-100"
                                    title="Copy & share draft"
                                    aria-label="Copy and share draft"
                                  >
                                    <Share size={15} strokeWidth={1.2} />
                                  </button>
                                </div>
                                {isPro && !isElite && draftId ? (
                                  <span className="text-right text-[8px] uppercase tracking-[0.08em] text-slate-500">
                                    {regenUsed}/{PRO_REGEN_LIMIT} regens
                                  </span>
                                ) : null}
                                {shareTip?.prospectId === prospect.id ? (
                                  <p className="max-w-[14rem] text-right text-[9px] leading-snug text-emerald-400/90">
                                    {shareTip.message}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className="mt-1.5 space-y-2 sm:mt-2">
                            {hasStackContextQuote ? (
                              <div className="flex items-start gap-2">
                                <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-500 sm:text-xs sm:leading-normal">
                                  {stackQuoteYou ? (
                                    <>
                                      <span className="text-slate-600">You · </span>
                                      &ldquo;{clipCtx(prospect.lastOutboundTextBody!)}&rdquo;
                                    </>
                                  ) : stackQuoteYouPlain ? (
                                    "You texted last."
                                  ) : (
                                    <>&ldquo;{clipCtx(prospect.lastInboundBody!)}&rdquo;</>
                                  )}
                                </p>
                                {prospect.phoneNumber ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      window.location.href = prospect.phoneNumber
                                        ? `sms:${prospect.phoneNumber}`
                                        : "sms:";
                                    }}
                                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-slate-500/40 transition hover:bg-slate-800/45 hover:text-slate-300"
                                    title="Open Messages"
                                    aria-label="Open Messages"
                                  >
                                    <MessageSquare size={13} strokeWidth={1.25} />
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2">
                              {!isPro && draftsEverGenerated >= FREE_AI_DRAFTS ? (
                                <button
                                  type="button"
                                  onClick={() => { setPaywallFeature("AI drafts"); setShowPaywall(true); }}
                                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rm-border)] px-3 py-1.5 text-[9px] uppercase tracking-[0.22em] text-[var(--rm-text-muted)]/60 transition hover:border-emerald-500/40 hover:text-emerald-400"
                                >
                                  <Lock size={10} strokeWidth={1.5} />
                                  Generate
                                  <span className="text-[8px] text-emerald-400/80">Pro</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleGenerateDraft(prospect)}
                                  disabled={generatingNoDraft}
                                  className="inline-flex items-center rounded-full border border-[var(--rm-border)] px-3 py-1.5 text-[9px] uppercase tracking-[0.22em] text-[var(--rm-text)] transition hover:border-[var(--rm-text)] disabled:opacity-50"
                                >
                                  {generatingNoDraft ? "…" : "Generate"}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleTouchedBase(prospect)}
                                disabled={quickTouchingId === prospect.id}
                                className="inline-flex items-center gap-1 rounded-full border border-slate-600/45 bg-slate-950/20 py-1 pl-1.5 pr-2 text-slate-500 transition hover:border-slate-500/55 hover:bg-slate-900/35 hover:text-slate-300 active:scale-[0.98] disabled:opacity-35"
                                title="Log chat — touched base & hide card"
                                aria-label="Log chat"
                              >
                                {quickTouchingId === prospect.id ? (
                                  <RefreshCw size={12} className="animate-spin" strokeWidth={1.35} />
                                ) : (
                                  <>
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-700/40 bg-slate-900/50">
                                      <ThumbsUp size={12} strokeWidth={1.2} />
                                    </span>
                                    <span className="text-[8px] font-medium uppercase tracking-[0.2em]">LOG CHAT</span>
                                  </>
                                )}
                              </button>
                              {!hasStackContextQuote && prospect.phoneNumber ? (
                                <button
                                  type="button"
                                  onClick={() => { window.location.href = `sms:${prospect.phoneNumber}`; }}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500/40 transition hover:bg-slate-800/45 hover:text-slate-300"
                                  title="Open Messages"
                                  aria-label="Open Messages"
                                >
                                  <MessageSquare size={13} strokeWidth={1.25} />
                                </button>
                              ) : null}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {dismissedDrafts.length > 0 ? (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setDismissedOpen((v) => !v)}
            className="flex w-full items-center justify-between border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-left text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
          >
            <span>Hidden cards ({dismissedDrafts.length})</span>
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
                      <p className="mt-1 text-xs text-[var(--rm-text-muted)]">Hidden from the main feed.</p>
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
  if (diffMs < 0) {
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  }
  const min = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
