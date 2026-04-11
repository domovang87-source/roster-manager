"use client";

import React from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { LogOut, Sparkles } from "lucide-react";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import PaywallModal from "../../../components/PaywallModal";
import AskDomoBridge from "../../../components/AskDomoBridge";
import { expectOutcomeAfterNextScreenshot } from "../../../lib/draft-outcome-analytics";
import { useProStatus } from "../../../lib/use-pro-status";
import type { MomentumContext } from "../../../lib/momentum-insight";
import { DEFAULT_REMIND_DAYS_BY_TIER } from "../../../lib/momentum-check-in";
import { clampNoteEngagementCredit, theirEngagementCreditFromNoteBody } from "../../../lib/note-engagement-signal";
import {
  buildProspectMomentumStateMap,
  coerceTier,
  collectRecentTextBodiesForProspect,
  computeThreadMomentum,
  computeThreadTrailSignals,
  isReactionMessageBody,
  remindByTierFromRulesRows,
  type Tier,
  type ThreadAgg,
} from "../../../lib/roster-portfolio-compute";
import { flattenTierProspects, isAtGhostingRisk } from "../../../lib/portfolio-stats";
import {
  FREE_AI_DRAFTS,
  fetchFreeLoggingCounts,
  freeTierLoggingAllowed,
  freeUserOverRosterLimit,
} from "../../../lib/free-tier";
import { useToast } from "../../../components/ui/Toast";
import PageHeader from "../../../components/ui/PageHeader";
import DraftCard, { type EliteToneId, type DraftCardProspect } from "../../../components/home/DraftCard";
import ScoreSheet from "../../../components/home/ScoreSheet";
import OnboardingBanner from "../../../components/home/OnboardingBanner";

const PRO_REGEN_LIMIT = 5;
const REGEN_STORAGE_KEY = "stack_draft_regen_counts_v1";

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
  const [tierProspects, setTierProspects] = React.useState<Record<Tier, DraftCardProspect[]>>({ A: [], B: [], C: [] });
  const [rosterCount, setRosterCount] = React.useState(0);
  const [activityCount, setActivityCount] = React.useState(0);
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState<string | null>(null);
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [paywallFeature, setPaywallFeature] = React.useState<string | undefined>(undefined);
  const [draftsEverGenerated, setDraftsEverGenerated] = React.useState(0);
  const [dismissingDraftIds, setDismissingDraftIds] = React.useState<Record<string, boolean>>({});
  const [dismissedDrafts, setDismissedDrafts] = React.useState<DismissedDraft[]>([]);
  const [dismissedOpen, setDismissedOpen] = React.useState(false);
  const [quickTouchingId, setQuickTouchingId] = React.useState<string | null>(null);
  const [regenByDraftId, setRegenByDraftId] = React.useState<Record<string, number>>({});
  const [draftToneByProspect, setDraftToneByProspect] = React.useState<Record<string, EliteToneId>>({});
  const [scoreSheetTarget, setScoreSheetTarget] = React.useState<DraftCardProspect | null>(null);
  const messagesEventTypeRef = React.useRef(true);
  const { isPro, isElite, checked, accountTier } = useProStatus();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  React.useEffect(() => { setRegenByDraftId(loadRegenMap()); }, []);

  React.useEffect(() => {
    const up = searchParams.get("upgrade");
    if (up !== "1" || !checked) return;
    if (!isPro) { setPaywallFeature("STACK Pro"); setShowPaywall(true); }
    router.replace("/home", { scroll: false });
  }, [searchParams, checked, isPro, router]);

  React.useEffect(() => {
    if (searchParams.get("canceled") !== "1") return;
    toast("Checkout paused — continue when you're ready.");
    router.replace("/home", { scroll: false });
  }, [searchParams, router, toast]);

  // Load dismissed from localStorage
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
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const localOnly = dismissedDrafts.filter((d) => !d.draftId);
    window.localStorage.setItem(LOCAL_DISMISSED_KEY, JSON.stringify(localOnly));
  }, [dismissedDrafts]);

  // --- Handlers ---

  const handleDismissCard = async (prospect: DraftCardProspect, draftId?: string, draftText?: string) => {
    const dismissKey = draftId || prospect.id;
    setDismissingDraftIds((prev) => ({ ...prev, [dismissKey]: true }));
    setDismissedDrafts((prev) => [
      { id: dismissKey, prospectId: prospect.id, prospectName: prospect.name, tier: prospect.tier, text: draftText, draftId, dismissedAt: new Date().toISOString() },
      ...prev.filter((d) => d.id !== dismissKey),
    ]);
    void fetch("/api/clear-prospect-briefing", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prospect_id: prospect.id }) });
    if (!draftId) return;
    try {
      const res = await fetch("/api/dismiss-draft", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft_id: draftId }) });
      if (!res.ok) { setError("Failed to dismiss draft."); setDismissingDraftIds((prev) => ({ ...prev, [dismissKey]: false })); return; }
      toast("Card hidden — open Hidden below to restore.");
    } catch { setError("Failed to dismiss draft."); setDismissingDraftIds((prev) => ({ ...prev, [dismissKey]: false })); }
  };

  const handleRestoreDismissed = async (draft: DismissedDraft) => {
    try {
      if (draft.draftId) {
        const res = await fetch("/api/undo-dismiss-draft", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft_id: draft.draftId }) });
        if (!res.ok) { setError("Failed to restore draft."); return; }
      }
      const client = supabaseRef.current;
      if (!client) { setError("Failed to restore draft."); return; }
      const [{ data: prospectRow }, { data: inboundRows }, { data: scheduledRows }] = await Promise.all([
        client.from("prospects").select("id,name,tier,phone_number,vibe_notes").eq("id", draft.prospectId).single(),
        client.from("messages").select("body,created_at,direction,event_type").eq("prospect_id", draft.prospectId).order("created_at", { ascending: false }).limit(80),
        client.from("scheduled_replies").select("id,draft_text").eq("prospect_id", draft.prospectId).eq("status", "scheduled").order("created_at", { ascending: false }).limit(1),
      ]);
      if (!prospectRow) { setDismissedDrafts((prev) => prev.filter((d) => d.prospectId !== draft.prospectId)); return; }
      const refreshedTier = coerceTier(prospectRow.tier, coerceTier(draft.tier));
      const msgRows = inboundRows ?? [];
      const scheduled = (scheduledRows ?? [])[0];
      const restoreAgg: ThreadAgg = { inbound: 0, outbound: 0, inboundText: 0, inboundNoteCredit: 0, outboundText: 0, noteCount: 0, touchBaseCount: 0, total: 0 };
      let restoreLastTextOut: string | undefined, restoreLastOutBody: string | undefined, restoreLastIn: string | undefined, restoreLastInBody: string | undefined;
      let restoreLatestDir: "inbound" | "outbound" | undefined, restoreLatestAt: string | undefined;
      const isoMs = (iso: string) => new Date(iso).getTime();
      for (const r of msgRows) {
        const at = r.created_at as string;
        const isInbound = String(r.direction ?? "").toLowerCase() === "inbound";
        const isNote = (r.event_type as string) === "note";
        const bodyStr = String(r.body ?? "");
        const isReaction = isReactionMessageBody(bodyStr);
        restoreAgg.total += 1;
        if (isInbound) { restoreAgg.inbound += 1; if (!isReaction) { restoreAgg.inboundText += 1; if (!restoreLastIn || isoMs(at) > isoMs(restoreLastIn)) { restoreLastIn = at; restoreLastInBody = bodyStr; } } }
        else { restoreAgg.outbound += 1; if (!isNote && !isReaction) { restoreAgg.outboundText += 1; if (!restoreLastTextOut || isoMs(at) > isoMs(restoreLastTextOut)) { restoreLastTextOut = at; restoreLastOutBody = bodyStr; } } if (bodyStr.includes("Touched base")) restoreAgg.touchBaseCount += 1; }
        if (isNote) { restoreAgg.noteCount += 1; const add = theirEngagementCreditFromNoteBody(bodyStr); if (add > 0) restoreAgg.inboundNoteCredit = clampNoteEngagementCredit(restoreAgg.inboundNoteCredit + add); }
      }
      if (restoreLastIn && restoreLastTextOut) { const msIn = isoMs(restoreLastIn); const msOut = isoMs(restoreLastTextOut); restoreLatestDir = msIn > msOut ? "inbound" : "outbound"; restoreLatestAt = msIn > msOut ? restoreLastIn : restoreLastTextOut; }
      else if (restoreLastIn) { restoreLatestDir = "inbound"; restoreLatestAt = restoreLastIn; }
      else if (restoreLastTextOut) { restoreLatestDir = "outbound"; restoreLatestAt = restoreLastTextOut; }
      const mappedMsgRows = (msgRows as Array<{ body?: string | null; created_at: string; direction: string; event_type?: string | null }>).map((r) => ({ body: r.body, created_at: r.created_at, direction: String(r.direction ?? ""), prospect_id: String(draft.prospectId), event_type: r.event_type }));
      const restoreTrail = computeThreadTrailSignals(mappedMsgRows);
      const { inbound: restoreRecentIn, outbound: restoreRecentOut } = collectRecentTextBodiesForProspect(mappedMsgRows, String(draft.prospectId));
      const restoreRemind = remindByTierRef.current[refreshedTier];
      const restoreNow = new Date();
      const restoreMomentum = restoreAgg.total > 0 ? computeThreadMomentum(restoreAgg, refreshedTier, { lastOutboundAt: restoreLastTextOut, remindAfterDays: restoreRemind, now: restoreNow, latestDirection: restoreLatestDir, lastInboundPreview: restoreLastInBody, trailSignals: restoreTrail, vibeNotes: (prospectRow.vibe_notes as string) ?? undefined, recentInboundTextBodies: restoreRecentIn, recentOutboundTextBodies: restoreRecentOut }) : 0;
      const restoreMomentumCtx: MomentumContext | undefined = restoreAgg.total > 0 ? { tier: refreshedTier, remindAfterDays: restoreRemind, inbound: restoreAgg.inbound, outbound: restoreAgg.outbound, inboundText: restoreAgg.inboundText, inboundNoteCredit: restoreAgg.inboundNoteCredit, outboundText: restoreAgg.outboundText, total: restoreAgg.total, noteCount: restoreAgg.noteCount, touchBaseCount: restoreAgg.touchBaseCount, lastInboundAt: restoreLastIn, lastOutboundAt: restoreLastTextOut, lastInboundPreview: restoreLastInBody, lastOutboundPreview: restoreLastOutBody, latestDirection: restoreLatestDir, latestAt: restoreLatestAt, inboundReactionCount: restoreTrail.inboundReactionCount, outboundRunSinceTheirText: restoreTrail.outboundRunSinceTheirText, tapbacksDuringYourStreak: restoreTrail.tapbacksDuringYourStreak } : undefined;
      setDismissedDrafts((prev) => prev.filter((d) => d.prospectId !== draft.prospectId));
      void fetch("/api/unclear-prospect-briefing", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prospect_id: draft.prospectId }) });
      setDismissingDraftIds((prev) => { const next = { ...prev }; delete next[draft.id]; if (draft.draftId) delete next[draft.draftId]; delete next[draft.prospectId]; return next; });
      setTierProspects((prev) => { const next = { ...prev }; (Object.keys(next) as Tier[]).forEach((tier) => { next[tier] = next[tier].filter((p) => p.id !== draft.prospectId); }); next[refreshedTier] = [{ id: String(prospectRow.id), name: prospectRow.name ?? draft.prospectName, tier: refreshedTier, phoneNumber: prospectRow.phone_number ?? undefined, vibeNotes: (prospectRow.vibe_notes as string) ?? undefined, lastInboundBody: restoreLastInBody, lastOutboundTextBody: restoreLastOutBody, lastActivityAt: (msgRows[0]?.created_at as string) ?? undefined, draftId: (scheduled?.id as string) ?? undefined, draftText: (scheduled?.draft_text as string) ?? undefined, momentum: restoreMomentum, momentumContext: restoreMomentumCtx }, ...next[refreshedTier]]; return next; });
      if (scheduled?.id && scheduled?.draft_text) setDraftEdits((prev) => ({ ...prev, [scheduled.id as string]: scheduled.draft_text as string }));
      toast("Restored");
    } catch { setError("Failed to restore draft."); }
  };

  // --- Data loading ---
  React.useEffect(() => {
    const config = getSupabaseConfig();
    const client = getSupabaseClient();
    supabaseRef.current = client;
    if (!client) { const missingParts = [!config.urlPresent ? "URL" : null, !config.keyPresent ? "Anon key" : null].filter(Boolean).join(" & "); setError(`Supabase is not configured (${missingParts} missing).`); return; }
    if (!checked) return;

    const loadTierProspects = async () => {
      const [prospectsRes, messagesRes, draftsRes, dismissedRes, rulesRes] = await Promise.all([
        client.from("prospects").select("id,name,tier,phone_number,vibe_notes"),
        client.from("messages").select("id,body,created_at,direction,prospect_id,event_type").order("created_at", { ascending: false }).limit(2000),
        client.from("scheduled_replies").select("id,draft_text,prospect_id").eq("status", "scheduled").limit(100),
        client.from("scheduled_replies").select("id,draft_text,prospect_id,tier,dismissed_at,prospects(name)").eq("status", "dismissed").order("dismissed_at", { ascending: false }).limit(50),
        client.from("tier_rules").select("tier,remind_after_days"),
      ]);
      const remindByTier = remindByTierFromRulesRows(rulesRes.data ?? []);
      remindByTierRef.current = remindByTier;
      const now = new Date();
      const momentumByProspect = buildProspectMomentumStateMap(prospectsRes.data ?? [], messagesRes.data ?? [], remindByTier, now);
      const draftByProspect = new Map<string, { id: string; text: string }>();
      for (const row of draftsRes.data ?? []) { const pid = row.prospect_id as string; if (!draftByProspect.has(pid)) draftByProspect.set(pid, { id: row.id as string, text: row.draft_text as string }); }
      const result: Record<Tier, DraftCardProspect[]> = { A: [], B: [], C: [] };
      const edits: Record<string, string> = {};
      for (const row of prospectsRes.data ?? []) {
        const tier = coerceTier(row.tier);
        if (!result[tier]) continue;
        const pid = String(row.id);
        const draft = draftByProspect.get(pid);
        const st = momentumByProspect.get(pid);
        result[tier].push({ id: pid, name: row.name ?? "Unknown", tier, phoneNumber: row.phone_number ?? undefined, vibeNotes: (row.vibe_notes as string) ?? undefined, lastInboundBody: st?.lastInboundBody, lastOutboundTextBody: st?.lastOutboundTextBody, lastActivityAt: st?.lastActivityAt, draftId: draft?.id, draftText: draft?.text, momentum: st?.momentum ?? 0, momentumContext: st?.momentumContext });
        if (draft) edits[draft.id] = draft.text;
      }
      const dismissed: DismissedDraft[] = (dismissedRes.data ?? []).map((row) => { const p = Array.isArray(row.prospects) ? row.prospects[0] : row.prospects; return { id: row.id as string, prospectId: row.prospect_id as string, prospectName: (p?.name as string) ?? "Unknown", tier: (row.tier as Tier) ?? "C", text: (row.draft_text as string) || undefined, draftId: row.id as string, dismissedAt: (row.dismissed_at as string) ?? new Date().toISOString() }; });
      setTierProspects(result);
      setDraftEdits(edits);
      const rosterIds = new Set((prospectsRes.data ?? []).map((row) => String(row.id)));
      setDismissedDrafts((prev) => { const localOnly = prev.filter((d) => !d.draftId); const combined = [...dismissed, ...localOnly].filter((d) => rosterIds.has(d.prospectId)); const byProspect = new Map<string, DismissedDraft>(); for (const d of combined) { const cur = byProspect.get(d.prospectId); if (!cur || (d.draftId && !cur.draftId)) byProspect.set(d.prospectId, d); } return Array.from(byProspect.values()); });
      setRosterCount((prospectsRes.data ?? []).length);
    };
    const loadActivityCount = async () => { const { count } = await client.from("messages").select("id", { count: "exact", head: true }); setActivityCount(count ?? 0); };
    const loadDraftsGenerated = async () => { const { count } = await client.from("scheduled_replies").select("id", { count: "exact", head: true }); setDraftsEverGenerated(count ?? 0); };
    loadTierProspects();
    loadActivityCount();
    loadDraftsGenerated();
  }, [checked]);

  const handleTouchedBase = async (prospect: DraftCardProspect, draftSummary?: string) => {
    const client = supabaseRef.current;
    if (!client) return;
    if (checked && freeUserOverRosterLimit(rosterCount, isPro)) { setPaywallFeature("Roster over free limit"); setShowPaywall(true); return; }
    const snap = await fetchFreeLoggingCounts(client);
    if (checked && !isPro && !freeTierLoggingAllowed(isPro, checked, snap.counts, snap.hasImportBatchColumn)) { setPaywallFeature("Unlimited logging"); setShowPaywall(true); return; }
    setQuickTouchingId(prospect.id);
    setError(null);
    const insertPayload: Record<string, unknown> = { prospect_id: prospect.id, direction: "outbound", body: "Touched base" };
    if (messagesEventTypeRef.current) insertPayload.event_type = "note";
    let { error: insertError } = await client.from("messages").insert(insertPayload);
    if (insertError?.message?.includes("event_type")) { messagesEventTypeRef.current = false; delete insertPayload.event_type; const retry = await client.from("messages").insert(insertPayload); insertError = retry.error; }
    if (insertError) { setError(insertError.message); setQuickTouchingId(null); return; }
    const dismissKey = prospect.draftId || prospect.id;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate([12, 45, 12]);
    setDismissingDraftIds((prev) => ({ ...prev, [dismissKey]: true }));
    window.setTimeout(() => {
      setDismissedDrafts((prev) => [{ id: dismissKey, prospectId: prospect.id, prospectName: prospect.name, tier: prospect.tier, text: draftSummary ?? prospect.draftText, draftId: prospect.draftId, dismissedAt: new Date().toISOString() }, ...prev.filter((d) => d.id !== dismissKey)]);
      if (prospect.draftId) void fetch("/api/dismiss-draft", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draft_id: prospect.draftId }) });
      setActivityCount((c) => c + 1);
      setQuickTouchingId(null);
      setDismissingDraftIds((prev) => { const next = { ...prev }; delete next[dismissKey]; return next; });
      toast("Logged", "success");
    }, 300);
  };

  const bumpRegenCount = React.useCallback((draftId: string) => {
    setRegenByDraftId((prev) => { const next = { ...prev, [draftId]: (prev[draftId] ?? 0) + 1 }; try { window.localStorage.setItem(REGEN_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ } return next; });
  }, []);

  const handleGenerateDraft = async (prospect: DraftCardProspect, opts?: { regenerate?: boolean }) => {
    const regenerating = Boolean(opts?.regenerate && prospect.draftId);
    if (checked && freeUserOverRosterLimit(rosterCount, isPro)) { setPaywallFeature("Roster over free limit"); setShowPaywall(true); return; }
    if (regenerating && !isPro) { setPaywallFeature("Regenerate draft"); setShowPaywall(true); return; }
    if (!regenerating && !isPro && draftsEverGenerated >= FREE_AI_DRAFTS) { setPaywallFeature("AI drafts"); setShowPaywall(true); return; }
    if (regenerating && prospect.draftId && isPro && !isElite && (regenByDraftId[prospect.draftId] ?? 0) >= PRO_REGEN_LIMIT) { setError("Pro includes 5 regenerations per draft. Elite adds unlimited."); return; }
    setIsGenerating(prospect.id);
    setError(null);
    try {
      const toneStyle = isElite ? draftToneByProspect[prospect.id] ?? "balanced" : undefined;
      const youTextedLast = prospect.momentumContext?.latestDirection === "outbound";
      const res = await fetch("/api/generate-response", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ tier: prospect.tier, name: prospect.name, vibeNotes: prospect.vibeNotes || "", incomingText: youTextedLast ? "" : prospect.lastInboundBody || "", ...(youTextedLast ? { youTextedLast: true } : {}), prospectId: prospect.id, ...(toneStyle ? { toneStyle } : {}), ...(regenerating ? { regenerate: true } : {}) }) });
      const data = (await res.json()) as { error?: string; code?: string; draft?: string; suggestedReply?: string; autoReply?: string };
      if (!res.ok || data?.error) {
        const code = data?.code;
        if (code === "REGENERATE_REQUIRES_PRO" || code === "DRAFT_LIMIT" || code === "ROSTER_OVER_FREE_LIMIT") { setPaywallFeature(code === "REGENERATE_REQUIRES_PRO" ? "Regenerate draft" : code === "ROSTER_OVER_FREE_LIMIT" ? "Roster over free limit" : "AI drafts"); setShowPaywall(true); return; }
        setError(data?.error ?? "Failed to generate draft."); return;
      }
      const draftText = data.draft ?? data.suggestedReply ?? data.autoReply ?? "";
      if (!draftText.trim()) { setError("No draft was generated."); return; }
      const client = supabaseRef.current;
      if (!client) return;
      if (regenerating && prospect.draftId) {
        const { data: updated, error: upErr } = await client.from("scheduled_replies").update({ draft_text: draftText }).eq("id", prospect.draftId).select("id,draft_text").single();
        if (upErr || !updated) { setError(upErr?.message ?? "Failed to update draft."); return; }
        const id = String(updated.id); const text = String(updated.draft_text ?? "");
        setTierProspects((prev) => { const next = { ...prev }; next[prospect.tier] = next[prospect.tier].map((p) => p.id === prospect.id ? { ...p, draftId: id, draftText: text } : p); return next; });
        setDraftEdits((prev) => ({ ...prev, [id]: text }));
        expectOutcomeAfterNextScreenshot(id, prospect.id);
        if (isPro && !isElite) bumpRegenCount(id);
        return;
      }
      const queueTier = prospect.tier === "A" ? "B" : prospect.tier;
      const insertPayloads: Array<Record<string, unknown>> = [
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText },
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText, status: "scheduled" },
        { prospect_id: prospect.id, tier: queueTier, draft_text: draftText, status: "pending" },
      ];
      type ScheduledDraftRow = { id: string; draft_text: string };
      let insertResult: PostgrestSingleResponse<ScheduledDraftRow> | undefined = undefined;
      for (const payload of insertPayloads) { const attempt: PostgrestSingleResponse<ScheduledDraftRow> = await client.from("scheduled_replies").insert(payload).select("id,draft_text").single(); insertResult = attempt; if (!attempt.error && attempt.data) break; }
      const row = insertResult?.data;
      if (!row) { setError(insertResult?.error?.message ?? "Failed to save draft."); return; }
      const inserted = { id: String(row.id), draftText: String(row.draft_text ?? "") };
      setTierProspects((prev) => { const next = { ...prev }; next[prospect.tier] = next[prospect.tier].map((p) => p.id === prospect.id ? { ...p, draftId: inserted.id, draftText: inserted.draftText } : p); return next; });
      setDraftEdits((prev) => ({ ...prev, [inserted.id]: inserted.draftText }));
      setDraftsEverGenerated((n) => n + 1);
      expectOutcomeAfterNextScreenshot(inserted.id, prospect.id);
    } catch { setError("Failed to generate draft."); } finally { setIsGenerating(null); }
  };

  const shareDraftText = async (text: string, prospectName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard", "success");
      if (typeof navigator.share === "function") await navigator.share({ text, title: `Draft for ${prospectName}` });
    } catch (err) { if (err instanceof Error && err.name !== "AbortError") setError("Could not copy."); }
  };

  // --- Derived state ---
  const hasProspects = rosterCount > 0;
  const hasActivity = activityCount > 0;
  const dismissedProspectIds = new Set(dismissedDrafts.map((d) => d.prospectId));
  const tierOrder: Tier[] = ["A", "B", "C"];
  const tierLabels: Record<Tier, string> = { A: "Top picks", B: "In the mix", C: "Casual" };
  const aListWaitingOnYou = React.useMemo(() => flattenTierProspects(tierProspects).filter((p) => isAtGhostingRisk(p)).length, [tierProspects]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-[0.3em]">STACK</h1>
          <div className="mt-1 flex items-center gap-2">
            {isPro ? (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${isElite ? "border-amber-500/40 text-amber-300" : "border-emerald-500/40 text-emerald-400"}`}>
                <Sparkles size={10} strokeWidth={1.5} />
                {isElite ? "Elite" : "Pro"}
              </span>
            ) : (
              <button type="button" onClick={() => setShowPaywall(true)} className="text-[11px] text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]">
                Upgrade
              </button>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={async () => { const { createBrowserSupabase } = await import("../../../lib/supabase/browser"); await createBrowserSupabase().auth.signOut(); window.location.href = "/login"; }}
          className="rounded-lg border border-[var(--rm-border)] p-2 text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
          aria-label="Sign out"
        >
          <LogOut size={16} strokeWidth={1.25} />
        </button>
      </header>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 text-rose-400 underline">dismiss</button>
        </div>
      )}

      {/* Onboarding */}
      <OnboardingBanner hasProspects={hasProspects} hasActivity={hasActivity} isPro={isPro} draftsEverGenerated={draftsEverGenerated} />

      {/* A-list alert */}
      {hasProspects && hasActivity && aListWaitingOnYou > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-100">
          {aListWaitingOnYou === 1
            ? "One top pick went last — you have an open loop."
            : `${aListWaitingOnYou} top picks went last — open loops.`}
        </div>
      )}

      {/* Insights link */}
      {hasProspects && hasActivity && (
        <div className="text-center">
          <Link href="/metrics" className="text-xs text-[var(--rm-text-muted)] underline decoration-[var(--rm-border)] underline-offset-2 transition hover:text-[var(--rm-text)]">
            See insights
          </Link>
        </div>
      )}

      {/* Draft cards by tier */}
      {hasProspects && (
        <div className="space-y-6">
          {tierOrder.map((tier) => {
            const visible = tierProspects[tier].filter((p) => !dismissedProspectIds.has(p.id));
            if (visible.length === 0) return null;
            return (
              <section key={tier}>
                <p className={`label mb-3 ${tier === "A" ? "text-amber-400" : "text-[var(--rm-text-muted)]"}`}>
                  {tierLabels[tier]} ({visible.length})
                </p>
                <div className="space-y-3">
                  {visible.map((prospect) => {
                    const draftId = prospect.draftId;
                    const currentDraft = draftId ? (draftEdits[draftId] ?? prospect.draftText ?? "") : "";
                    const dismissKey = draftId || prospect.id;
                    return (
                      <DraftCard
                        key={prospect.id}
                        prospect={prospect}
                        currentDraft={currentDraft}
                        isGenerating={isGenerating === prospect.id}
                        isDismissing={Boolean(dismissingDraftIds[dismissKey])}
                        isPro={isPro}
                        isElite={isElite}
                        regenUsed={draftId ? (regenByDraftId[draftId] ?? 0) : 0}
                        regenLimit={PRO_REGEN_LIMIT}
                        draftsEverGenerated={draftsEverGenerated}
                        freeDraftLimit={FREE_AI_DRAFTS}
                        quickTouching={quickTouchingId === prospect.id}
                        toneId={draftToneByProspect[prospect.id] ?? "balanced"}
                        onScoreTap={() => setScoreSheetTarget(prospect)}
                        onGenerate={(regen) => regen ? handleGenerateDraft(prospect, { regenerate: true }) : handleGenerateDraft(prospect)}
                        onDismiss={() => draftId ? handleDismissCard(prospect, draftId, currentDraft) : handleDismissCard(prospect)}
                        onTouchedBase={() => handleTouchedBase(prospect, currentDraft)}
                        onShare={() => shareDraftText(currentDraft, prospect.name)}
                        onSetTone={(tone) => setDraftToneByProspect((prev) => ({ ...prev, [prospect.id]: tone }))}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Hidden cards */}
      {dismissedDrafts.length > 0 && (
        <section>
          <button type="button" onClick={() => setDismissedOpen((v) => !v)} className="w-full rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-left text-xs text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)]">
            Hidden ({dismissedDrafts.length}) · {dismissedOpen ? "hide" : "view"}
          </button>
          {dismissedOpen && (
            <div className="mt-2 space-y-2">
              {dismissedDrafts.map((draft) => (
                <div key={draft.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg)] px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{draft.prospectName} <span className="text-xs text-[var(--rm-text-muted)]">{draft.tier}</span></p>
                    {draft.text && <p className="mt-0.5 truncate text-xs text-[var(--rm-text-muted)]">{draft.text}</p>}
                  </div>
                  <button type="button" onClick={() => handleRestoreDismissed(draft)} className="shrink-0 rounded-full border border-[var(--rm-border)] px-3 py-1.5 text-xs text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)] hover:text-[var(--rm-text)]">
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Ask Domo */}
      <AskDomoBridge onRequestPro={() => { setPaywallFeature("Ask Domo coaching (Pro)"); setShowPaywall(true); }} />

      {/* Score sheet */}
      <ScoreSheet
        open={Boolean(scoreSheetTarget)}
        onClose={() => setScoreSheetTarget(null)}
        name={scoreSheetTarget?.name ?? ""}
        score={scoreSheetTarget?.momentum ?? 0}
        tier={scoreSheetTarget?.tier ?? ""}
        context={scoreSheetTarget?.momentumContext}
      />

      {/* Paywall */}
      <PaywallModal isOpen={showPaywall} onClose={() => { setShowPaywall(false); setPaywallFeature(undefined); }} feature={paywallFeature} />
    </div>
  );
}
