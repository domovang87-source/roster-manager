"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Heart, StickyNote, Plus, Calendar, ImagePlus, X, Loader2, Pencil, Trash2 } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import {
  parseDatetimeLocalToUtcIso,
  toLocalDatetimeInputValue,
} from "../../../lib/datetime-local";
import { onScreenshotImportedForProspect } from "../../../lib/draft-outcome-analytics";
import PaywallModal from "../../../components/PaywallModal";
import {
  type FreeLoggingCounts,
  fetchFreeLoggingCounts,
  freeTierLoggingAllowed,
  freeUserOverRosterLimit,
} from "../../../lib/free-tier";
import { guessProspectIdFromFilename } from "../../../lib/guess-prospect-from-filename";
import { guessProspectIdFromThreadHint } from "../../../lib/match-prospect-from-thread-hint";
import { useProStatus } from "../../../lib/use-pro-status";

type EventType = "text" | "note";

const EVENT_CONFIG: Record<EventType, { label: string; icon: typeof MessageSquare; colorClass: string }> = {
  text: { label: "Text", icon: MessageSquare, colorClass: "text-blue-400 border-blue-400/40" },
  note: { label: "Note", icon: StickyNote, colorClass: "text-purple-400 border-purple-400/40" },
};

/** Older rows used date / call / hangout / etc. — treat like thread context unless it’s a real note. */
function normalizeEventType(raw: string | null | undefined): EventType {
  return raw === "note" ? "note" : "text";
}

type Prospect = { id: string; name: string; tier: string };

type LogEntry = {
  id: string;
  prospectId: string;
  prospectName: string;
  eventType: EventType;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
  /** Same UUID for all bubbles from one screenshot save — delete batch in one action. */
  importBatchId?: string | null;
};

type LogDisplayGroup =
  | { kind: "single"; entry: LogEntry }
  | { kind: "batch"; batchId: string; entries: LogEntry[] };

function groupLogEntriesForDisplay(entries: LogEntry[]): LogDisplayGroup[] {
  const byBatch = new Map<string, LogEntry[]>();
  const singles: LogEntry[] = [];
  for (const e of entries) {
    const b = e.importBatchId;
    if (b) {
      const list = byBatch.get(b) ?? [];
      list.push(e);
      byBatch.set(b, list);
    } else {
      singles.push(e);
    }
  }
  for (const arr of byBatch.values()) {
    // Oldest first so a screenshot reads top-to-bottom like the thread.
    arr.sort((a, x) => new Date(a.createdAt).getTime() - new Date(x.createdAt).getTime());
  }
  const groups: LogDisplayGroup[] = [];
  for (const [batchId, ents] of byBatch) {
    if (ents.length > 0) groups.push({ kind: "batch", batchId, entries: ents });
  }
  for (const e of singles) {
    groups.push({ kind: "single", entry: e });
  }
  groups.sort((a, b) => {
    const maxTs = (g: LogDisplayGroup) =>
      g.kind === "batch"
        ? Math.max(...g.entries.map((x) => new Date(x.createdAt).getTime()))
        : new Date(g.entry.createdAt).getTime();
    return maxTs(b) - maxTs(a);
  });
  return groups;
}

type ParsedMessage = { direction: string; body: string };

function isReactionBody(body: string): boolean {
  return body.trim().toLowerCase().startsWith("reacted ");
}

/** One header row per contiguous run of the same kind (e.g. one “Text” for many bubbles). */
function clusterBatchLinesByKind(entries: LogEntry[]): { label: string; entries: LogEntry[] }[] {
  const clusters: { label: string; entries: LogEntry[] }[] = [];
  for (const e of entries) {
    const reaction = isReactionBody(e.body);
    const label = reaction
      ? "Reaction"
      : (EVENT_CONFIG[e.eventType] ?? EVENT_CONFIG.text).label;
    const last = clusters[clusters.length - 1];
    if (last && last.label === label) last.entries.push(e);
    else clusters.push({ label, entries: [e] });
  }
  return clusters;
}

function batchLineBubbleClass(entry: LogEntry): string {
  if (isReactionBody(entry.body)) {
    return "border-pink-400/25 bg-pink-500/[0.08]";
  }
  if (entry.direction === "inbound") {
    return "border-slate-500/30 bg-slate-500/[0.08]";
  }
  return "border-sky-500/25 bg-sky-950/40";
}

/** Deep-link from Home stack cards: /inbox?prospect=<uuid> */
function SyncInboxProspectParam({
  prospects,
  setFilterProspectId,
}: {
  prospects: Prospect[];
  setFilterProspectId: React.Dispatch<React.SetStateAction<string>>;
}) {
  const searchParams = useSearchParams();
  const prospectParam = searchParams.get("prospect");
  React.useEffect(() => {
    if (!prospectParam || prospects.length === 0) return;
    if (!prospects.some((p) => p.id === prospectParam)) return;
    setFilterProspectId(prospectParam);
  }, [prospectParam, prospects, setFilterProspectId]);
  return null;
}

export default function ActivityLogPage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [hasEventTypeCol, setHasEventTypeCol] = React.useState(true);
  const [hasImportBatchCol, setHasImportBatchCol] = React.useState(true);
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [prospects, setProspects] = React.useState<Prospect[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [filterProspectId, setFilterProspectId] = React.useState("");

  // Manual log modal
  const [isLogOpen, setIsLogOpen] = React.useState(false);
  const [selectedProspectId, setSelectedProspectId] = React.useState("");
  const [logBody, setLogBody] = React.useState("");
  const [logType, setLogType] = React.useState<EventType>("text");
  const [logWhen, setLogWhen] = React.useState(() => toLocalDatetimeInputValue(new Date()));
  const [isSending, setIsSending] = React.useState(false);
  const [logError, setLogError] = React.useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
  const [editProspectId, setEditProspectId] = React.useState("");
  const [editType, setEditType] = React.useState<EventType>("text");
  const [editBody, setEditBody] = React.useState("");
  const [editWhen, setEditWhen] = React.useState(() => toLocalDatetimeInputValue(new Date()));
  const [editDirection, setEditDirection] = React.useState<"inbound" | "outbound">("outbound");
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = React.useState<string | null>(null);

  // Screenshot modal
  const [isScreenshotOpen, setIsScreenshotOpen] = React.useState(false);
  const [screenshotProspectId, setScreenshotProspectId] = React.useState("");
  const [screenshotPreview, setScreenshotPreview] = React.useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = React.useState<File | null>(null);
  const [screenshotFilenameLabel, setScreenshotFilenameLabel] = React.useState("");
  const [isParsing, setIsParsing] = React.useState(false);
  const [parsedMessages, setParsedMessages] = React.useState<ParsedMessage[]>([]);
  const [isSavingScreenshot, setIsSavingScreenshot] = React.useState(false);
  const [screenshotError, setScreenshotError] = React.useState<string | null>(null);
  const [screenshotThreadTitle, setScreenshotThreadTitle] = React.useState<string | null>(null);
  const [screenshotMatchSource, setScreenshotMatchSource] = React.useState<"thread" | "filename" | null>(null);
  const [importToast, setImportToast] = React.useState<string | null>(null);
  const [logGate, setLogGate] = React.useState<{
    counts: FreeLoggingCounts;
    hasImportBatchColumn: boolean;
  }>({
    counts: { totalMessages: 0, distinctImportBatches: 0, manualOnlyMessages: 0 },
    hasImportBatchColumn: true,
  });
  const [showPaywall, setShowPaywall] = React.useState(false);
  const [paywallFeature, setPaywallFeature] = React.useState<string | undefined>(undefined);
  const { isPro, checked } = useProStatus();

  const legacyRosterBlock = checked && freeUserOverRosterLimit(prospects.length, isPro);

  const openLegacyRosterPaywall = () => {
    setPaywallFeature("Roster over free limit");
    setShowPaywall(true);
  };

  const refreshLogGate = React.useCallback(async (client: NonNullable<ReturnType<typeof getSupabaseClient>>) => {
    const snap = await fetchFreeLoggingCounts(client);
    setLogGate({ counts: snap.counts, hasImportBatchColumn: snap.hasImportBatchColumn });
  }, []);

  const loadEntries = React.useCallback(async (client: NonNullable<ReturnType<typeof getSupabaseClient>>) => {
    const mapRow = (
      row: Record<string, unknown>,
      eventFallback: boolean,
      batchFallback: boolean
    ): LogEntry => {
      const prospect = Array.isArray(row.prospects) ? row.prospects[0] : row.prospects;
      return {
        id: row.id as string,
        prospectId: row.prospect_id as string,
        prospectName: (prospect?.name as string) || "Unknown",
        eventType: eventFallback ? "text" : normalizeEventType(row.event_type as string),
        direction: (row.direction as "inbound" | "outbound") || "outbound",
        body: (row.body as string) || "",
        createdAt: row.created_at as string,
        importBatchId: batchFallback ? null : ((row.import_batch_id as string | null) ?? null),
      };
    };

    const buildSelect = (eventCol: boolean, batchCol: boolean) => {
      const cols = ["id", "body", "direction"];
      if (eventCol) cols.push("event_type");
      if (batchCol) cols.push("import_batch_id");
      cols.push("created_at", "prospect_id", "prospects(name)");
      return cols.join(",");
    };

    let eventCol = hasEventTypeCol;
    let batchCol = hasImportBatchCol;

    let { data, error: queryError } = await client
      .from("messages")
      .select(buildSelect(eventCol, batchCol))
      .order("created_at", { ascending: false })
      .limit(200);

    if (
      queryError &&
      batchCol &&
      (queryError.message?.includes("import_batch_id") ||
        (queryError.message?.includes("column") && queryError.message?.toLowerCase().includes("import_batch")))
    ) {
      batchCol = false;
      setHasImportBatchCol(false);
      ({ data, error: queryError } = await client
        .from("messages")
        .select(buildSelect(eventCol, batchCol))
        .order("created_at", { ascending: false })
        .limit(200));
    }

    if (queryError && eventCol && queryError.message?.includes("event_type")) {
      eventCol = false;
      setHasEventTypeCol(false);
      ({ data, error: queryError } = await client
        .from("messages")
        .select(buildSelect(eventCol, batchCol))
        .order("created_at", { ascending: false })
        .limit(200));
      if (
        queryError &&
        batchCol &&
        (queryError.message?.includes("import_batch_id") ||
          (queryError.message?.includes("column") && queryError.message?.toLowerCase().includes("import_batch")))
      ) {
        batchCol = false;
        setHasImportBatchCol(false);
        ({ data, error: queryError } = await client
          .from("messages")
          .select(buildSelect(eventCol, batchCol))
          .order("created_at", { ascending: false })
          .limit(200));
      }
    }

    if (queryError) {
      setEntries([]);
      return;
    }

    setEntries(
      (data ?? []).map((row) =>
        mapRow(row as unknown as Record<string, unknown>, !eventCol, !batchCol)
      )
    );
    await refreshLogGate(client);
  }, [hasEventTypeCol, hasImportBatchCol, refreshLogGate]);

  React.useEffect(() => {
    const config = getSupabaseConfig();
    const client = getSupabaseClient();
    supabaseRef.current = client;
    if (!client) {
      const missingParts = [!config.urlPresent ? "URL" : null, !config.keyPresent ? "Anon key" : null].filter(Boolean).join(" & ");
      setError(`Supabase is not configured (${missingParts} missing).`);
      return;
    }
    const loadProspects = async () => {
      const { data } = await client.from("prospects").select("id,name,tier");
      setProspects((data ?? []).map((r) => ({ id: String(r.id), name: r.name ?? "Unknown", tier: (r.tier as string) ?? "C" })));
    };
    loadProspects();
    loadEntries(client);
  }, [loadEntries]);

  const logBlocked =
    checked &&
    !isPro &&
    !freeTierLoggingAllowed(isPro, checked, logGate.counts, logGate.hasImportBatchColumn);

  const openLogPaywall = () => {
    setPaywallFeature("Texts");
    setShowPaywall(true);
  };

  // Manual log handler
  const handleLogEntry = async () => {
    const client = supabaseRef.current;
    if (!client) return;
    if (legacyRosterBlock) {
      openLegacyRosterPaywall();
      return;
    }
    const snap = await fetchFreeLoggingCounts(client);
    setLogGate({ counts: snap.counts, hasImportBatchColumn: snap.hasImportBatchColumn });
    if (checked && !isPro && !freeTierLoggingAllowed(isPro, checked, snap.counts, snap.hasImportBatchColumn)) {
      openLogPaywall();
      return;
    }
    if (!selectedProspectId) { setLogError("Pick who this is about"); return; }
    if (!logBody.trim()) { setLogError("Add some details about what happened"); return; }

    setIsSending(true);
    setLogError(null);
    const createdAt = parseDatetimeLocalToUtcIso(logWhen) ?? new Date().toISOString();

    const insertPayload: Record<string, unknown> = {
      prospect_id: selectedProspectId,
      direction: "outbound",
      body: logBody.trim(),
      created_at: createdAt,
    };
    if (hasEventTypeCol) insertPayload.event_type = logType;

    const { error: insertError } = await client.from("messages").insert(insertPayload);
    if (insertError) {
      if (insertError.message?.includes("event_type")) {
        setHasEventTypeCol(false);
        delete insertPayload.event_type;
        const { error: retryError } = await client.from("messages").insert(insertPayload);
        if (retryError) { setLogError(retryError.message); setIsSending(false); return; }
      } else { setLogError(insertError.message); setIsSending(false); return; }
    }
    const who = prospects.find((p) => p.id === selectedProspectId)?.name ?? "them";
    setImportToast(`Logged · ${who}'s Active Charisma Score updated`);
    window.setTimeout(() => setImportToast(null), 5000);
    setLogBody("");
    setLogWhen(toLocalDatetimeInputValue(new Date()));
    setIsLogOpen(false);
    setIsSending(false);
    await loadEntries(client);
  };

  // Screenshot handlers
  const runScreenshotParse = React.useCallback(async (file: File) => {
    if (checked && freeUserOverRosterLimit(prospects.length, isPro)) {
      setScreenshotError(
        "Free tier is 1 person on your roster. Upgrade to Pro to import screenshots, or remove people until you’re at one."
      );
      setScreenshotThreadTitle(null);
      setScreenshotMatchSource(null);
      setParsedMessages([]);
      return;
    }
    setIsParsing(true);
    setScreenshotError(null);
    setParsedMessages([]);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/parse-screenshot", {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScreenshotError(data.error ?? "Failed to read screenshot");
        setScreenshotThreadTitle(null);
        setScreenshotMatchSource(null);
        return;
      }
      const msgs = (data.messages ?? []) as ParsedMessage[];
      const threadTitle =
        typeof data.threadTitle === "string" && data.threadTitle.trim()
          ? data.threadTitle.trim()
          : null;
      setScreenshotThreadTitle(threadTitle);

      setParsedMessages(msgs);
      if (msgs.length === 0) {
        setScreenshotError("Couldn't find any messages in this screenshot. Try a clearer one.");
        setScreenshotMatchSource(null);
        return;
      }

      const fromThread = guessProspectIdFromThreadHint(threadTitle, prospects);
      const fromFile = guessProspectIdFromFilename(file.name, prospects);
      let source: "thread" | "filename" | null = null;
      let autoId = "";
      if (fromThread) {
        autoId = fromThread;
        source = "thread";
      } else if (fromFile) {
        autoId = fromFile;
        source = "filename";
      }
      setScreenshotMatchSource(source);
      setScreenshotProspectId((prev) => autoId || prev || "");
    } catch {
      setScreenshotError("Failed to analyze screenshot");
      setScreenshotThreadTitle(null);
      setScreenshotMatchSource(null);
    } finally {
      setIsParsing(false);
    }
  }, [prospects, checked, isPro]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setParsedMessages([]);
    setScreenshotError(null);
    setScreenshotThreadTitle(null);
    setScreenshotMatchSource(null);
    setScreenshotFilenameLabel(file.name);
    void runScreenshotParse(file);
  };

  const handleSaveScreenshotMessages = async () => {
    const client = supabaseRef.current;
    if (!client || !screenshotProspectId || parsedMessages.length === 0) return;
    if (legacyRosterBlock) {
      openLegacyRosterPaywall();
      return;
    }
    const snap = await fetchFreeLoggingCounts(client);
    setLogGate({ counts: snap.counts, hasImportBatchColumn: snap.hasImportBatchColumn });
    if (checked && !isPro && !freeTierLoggingAllowed(isPro, checked, snap.counts, snap.hasImportBatchColumn)) {
      setPaywallFeature("Screenshot import");
      setShowPaywall(true);
      return;
    }

    setIsSavingScreenshot(true);
    setScreenshotError(null);

    const nowMs = Date.now();
    const baseMs = nowMs;
    const importBatchId = crypto.randomUUID();

    const buildRows = (includeBatch: boolean) =>
      parsedMessages.map((msg, idx) => {
        const row: Record<string, unknown> = {
          prospect_id: screenshotProspectId,
          direction: msg.direction === "inbound" ? "inbound" : "outbound",
          body: msg.body,
          created_at: new Date(baseMs + idx * 60_000).toISOString(),
        };
        if (hasEventTypeCol) row.event_type = "text";
        if (includeBatch && hasImportBatchCol) row.import_batch_id = importBatchId;
        return row;
      });

    let rows = buildRows(true);
    let { error: insertError } = await client.from("messages").insert(rows);
    if (
      insertError &&
      hasImportBatchCol &&
      (insertError.message?.includes("import_batch_id") ||
        (insertError.message?.includes("column") &&
          insertError.message?.toLowerCase().includes("import_batch")))
    ) {
      setHasImportBatchCol(false);
      rows = buildRows(false);
      ({ error: insertError } = await client.from("messages").insert(rows));
    }
    if (insertError) {
      setScreenshotError(insertError.message);
      setIsSavingScreenshot(false);
      return;
    }

    onScreenshotImportedForProspect(screenshotProspectId);

    const savedTier = prospects.find((p) => p.id === screenshotProspectId)?.tier ?? null;
    const savedCount = parsedMessages.length;
    const savedThread = Boolean(screenshotThreadTitle);
    const savedMatch = screenshotMatchSource ?? "none";
    void fetch("/api/metrics/screenshot-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageCount: savedCount,
        threadTitlePresent: savedThread,
        matchSource: savedMatch,
        tier: savedTier,
      }),
    }).catch(() => {});

    const who = prospects.find((p) => p.id === screenshotProspectId)?.name ?? "them";
    setImportToast(
      `Logged ${parsedMessages.length} bubble${parsedMessages.length === 1 ? "" : "s"} · ${who}'s Active Charisma Score updated`
    );
    window.setTimeout(() => setImportToast(null), 5000);

    setIsScreenshotOpen(false);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setParsedMessages([]);
    setScreenshotProspectId("");
    setScreenshotFilenameLabel("");
    setScreenshotThreadTitle(null);
    setScreenshotMatchSource(null);
    setIsSavingScreenshot(false);
    await loadEntries(client);
  };

  const resetScreenshotModal = () => {
    setIsScreenshotOpen(false);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setParsedMessages([]);
    setScreenshotError(null);
    setScreenshotProspectId("");
    setScreenshotFilenameLabel("");
    setScreenshotThreadTitle(null);
    setScreenshotMatchSource(null);
  };

  const handleOpenEditEntry = (entry: LogEntry) => {
    setEditingEntryId(entry.id);
    setEditProspectId(entry.prospectId);
    setEditType(normalizeEventType(entry.eventType));
    setEditBody(entry.body);
    setEditDirection(entry.direction === "inbound" ? "inbound" : "outbound");
    setEditWhen(toLocalDatetimeInputValue(new Date(entry.createdAt)));
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleUpdateEntry = async () => {
    const client = supabaseRef.current;
    if (!client || !editingEntryId) return;
    if (!editProspectId) { setEditError("Pick who this is about"); return; }
    if (!editBody.trim()) { setEditError("Add some details about what happened"); return; }

    setIsUpdating(true);
    setEditError(null);
    const whenDate = new Date(editWhen);
    const createdAt = isNaN(whenDate.getTime()) ? new Date().toISOString() : whenDate.toISOString();
    const payload: Record<string, unknown> = {
      prospect_id: editProspectId,
      body: editBody.trim(),
      created_at: createdAt,
      direction: editDirection,
    };
    if (hasEventTypeCol) payload.event_type = editType;
    const { error: updateError } = await client.from("messages").update(payload).eq("id", editingEntryId);
    if (updateError) {
      setEditError(updateError.message);
      setIsUpdating(false);
      return;
    }
    setIsUpdating(false);
    setIsEditOpen(false);
    setEditingEntryId(null);
    await loadEntries(client);
  };

  const handleDeleteImportBatch = async (batchId: string, prospectName: string, count: number) => {
    const client = supabaseRef.current;
    if (!client) return;
    if (!hasImportBatchCol) {
      setError("Batch delete needs DB column import_batch_id — run messages-import-batch-migration.sql in Supabase.");
      return;
    }
    if (
      !window.confirm(
        `Delete this whole screenshot import for ${prospectName}? (${count} lines — one tap undo isn’t available.)`
      )
    ) {
      return;
    }
    setDeletingBatchId(batchId);
    setError(null);
    const { error: delErr } = await client.from("messages").delete().eq("import_batch_id", batchId);
    setDeletingBatchId(null);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    if (editingEntryId) {
      setIsEditOpen(false);
      setEditingEntryId(null);
    }
    await loadEntries(client);
  };

  const handleDeleteEntry = async (entry: LogEntry) => {
    const client = supabaseRef.current;
    if (!client) return;
    if (!window.confirm(`Delete this log line for ${entry.prospectName}? This cannot be undone.`)) return;

    setDeletingId(entry.id);
    setError(null);
    const { error: deleteError } = await client.from("messages").delete().eq("id", entry.id);
    setDeletingId(null);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (editingEntryId === entry.id) {
      setIsEditOpen(false);
      setEditingEntryId(null);
    }
    await loadEntries(client);
  };

  const filtered = filterProspectId
    ? entries.filter((e) => e.prospectId === filterProspectId)
    : entries;

  const displayGroups = React.useMemo(
    () => groupLogEntriesForDisplay(filtered),
    [filtered]
  );

  const tryOpenScreenshot = async () => {
    const client = supabaseRef.current;
    if (legacyRosterBlock) {
      openLegacyRosterPaywall();
      return;
    }
    if (client) {
      const snap = await fetchFreeLoggingCounts(client);
      setLogGate({ counts: snap.counts, hasImportBatchColumn: snap.hasImportBatchColumn });
      if (checked && !isPro && !freeTierLoggingAllowed(isPro, checked, snap.counts, snap.hasImportBatchColumn)) {
        openLogPaywall();
        return;
      }
    } else if (logBlocked) {
      openLogPaywall();
      return;
    }
    setScreenshotError(null);
    setParsedMessages([]);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setScreenshotFilenameLabel("");
    setScreenshotProspectId(filterProspectId || (prospects.length === 1 ? prospects[0].id : ""));
    setIsScreenshotOpen(true);
  };

  const tryOpenManualLog = async () => {
    const client = supabaseRef.current;
    if (legacyRosterBlock) {
      openLegacyRosterPaywall();
      return;
    }
    if (client) {
      const snap = await fetchFreeLoggingCounts(client);
      setLogGate({ counts: snap.counts, hasImportBatchColumn: snap.hasImportBatchColumn });
      if (checked && !isPro && !freeTierLoggingAllowed(isPro, checked, snap.counts, snap.hasImportBatchColumn)) {
        openLogPaywall();
        return;
      }
    } else if (logBlocked) {
      openLogPaywall();
      return;
    }
    setLogWhen(toLocalDatetimeInputValue(new Date()));
    setLogType("text");
    setLogError(null);
    setSelectedProspectId(filterProspectId || (prospects.length === 1 ? prospects[0].id : ""));
    setIsLogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <SyncInboxProspectParam prospects={prospects} setFilterProspectId={setFilterProspectId} />
      </Suspense>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-wide">Your texts</h1>
          <p className="text-sm text-[var(--rm-text-muted)]">
            Upload a screenshot of the thread or type what happened (text vs note — same goal: context so Home and the
            AI know what’s real).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={tryOpenScreenshot}
            className="flex items-center gap-2 border border-blue-400/50 px-4 py-2 text-xs uppercase tracking-[0.3em] text-blue-400 transition hover:border-blue-400 hover:bg-blue-400/10"
          >
            <ImagePlus size={14} strokeWidth={1.25} />
            Screenshot
          </button>
          <button
            type="button"
            onClick={tryOpenManualLog}
            className="flex items-center gap-2 border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)]"
          >
            <Plus size={14} strokeWidth={1.25} />
            Log
          </button>
        </div>
      </header>

      {legacyRosterBlock ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100/95">
          <span>
            You have more than <strong className="text-[var(--rm-text)]">1 person</strong> on your roster. Free tier
            allows one — upgrade to keep logging and screenshot imports, or remove people until you&apos;re at one.
          </span>
          <button
            type="button"
            onClick={openLegacyRosterPaywall}
            className="shrink-0 border border-rose-400/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-rose-100 transition hover:bg-rose-400/15"
          >
            Upgrade
          </button>
        </div>
      ) : null}

      {logBlocked ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
          <span>
            Free tier: one screenshot import (all bubbles in that batch) <em className="not-italic">or</em> one manual
            log — then upgrade for unlimited logging.
          </span>
          <button
            type="button"
            onClick={openLogPaywall}
            className="shrink-0 border border-amber-400/60 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-amber-200 transition hover:bg-amber-400/15"
          >
            Upgrade
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="border border-rose-500/40 bg-[var(--rm-bg-elevated)] p-4 text-sm text-rose-400">
          {error}
        </div>
      ) : null}

      {importToast ? (
        <div className="fixed bottom-6 left-1/2 z-[120] max-w-[min(90vw,24rem)] -translate-x-1/2 border border-emerald-500/40 bg-[var(--rm-bg-elevated)] px-4 py-3 text-center text-sm text-emerald-100/95 shadow-lg">
          {importToast}
        </div>
      ) : null}

      {!hasEventTypeCol ? (
        <div className="border border-amber-500/40 bg-[var(--rm-bg-elevated)] p-4 text-sm text-amber-400">
          Run <code className="font-mono text-xs">activity-log-migration.sql</code> in your Supabase SQL Editor to enable event types.
        </div>
      ) : null}

      {!hasImportBatchCol ? (
        <div className="border border-amber-500/40 bg-[var(--rm-bg-elevated)] p-4 text-sm text-amber-400">
          Run <code className="font-mono text-xs">messages-import-batch-migration.sql</code> to group screenshot imports and delete a whole batch at once.
        </div>
      ) : null}

      <label className="flex max-w-md flex-col gap-1 text-[10px] uppercase tracking-[0.25em] text-[var(--rm-text-muted)]">
        <span>Filter by person</span>
        <select
          value={filterProspectId}
          onChange={(e) => setFilterProspectId(e.target.value)}
          className="border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2 text-sm font-normal normal-case tracking-normal text-[var(--rm-text)]"
        >
          <option value="">All people</option>
          {[...prospects]
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.tier})
              </option>
            ))}
        </select>
      </label>

      <div className="space-y-1.5">
        {filtered.length === 0 ? (
          <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6 text-center">
            <p className="text-sm text-[var(--rm-text-muted)]">
              No activity yet. Upload a screenshot or tap "+ Log" to start.
            </p>
          </div>
        ) : (
          displayGroups.map((group) => {
            if (group.kind === "single") {
              const entry = group.entry;
              const reaction = isReactionBody(entry.body);
              const config = reaction
                ? { label: "Reaction", icon: Heart, colorClass: "text-pink-300 border-pink-300/40" }
                : (EVENT_CONFIG[entry.eventType] ?? EVENT_CONFIG.text);
              const Icon = config.icon;
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-3"
                >
                  <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border ${config.colorClass}`}>
                    <Icon size={14} strokeWidth={1.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold">{entry.prospectName}</p>
                        <span className={`text-[10px] uppercase tracking-[0.2em] ${config.colorClass.split(" ")[0]}`}>
                          {config.label}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <span className="mr-1 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                          {formatTime(entry.createdAt)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenEditEntry(entry)}
                          className="flex h-8 w-8 items-center justify-center text-[var(--rm-text-muted)]/70 transition hover:text-[var(--rm-text)]"
                          aria-label="Edit entry"
                          title="Edit"
                        >
                          <Pencil size={12} strokeWidth={1.5} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteEntry(entry)}
                          disabled={deletingId === entry.id}
                          className="flex h-8 w-8 items-center justify-center text-[var(--rm-text-muted)]/50 transition hover:text-rose-400 disabled:opacity-30"
                          aria-label="Delete log entry"
                          title="Delete"
                        >
                          {deletingId === entry.id ? (
                            <Loader2 size={12} strokeWidth={1.5} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} strokeWidth={1.5} />
                          )}
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-[var(--rm-text-muted)]">{entry.body}</p>
                  </div>
                </div>
              );
            }

            const batch = group.entries;
            const head = batch[0];
            const lineClusters = clusterBatchLinesByKind(batch);
            return (
              <div
                key={group.batchId}
                className="border border-blue-500/30 bg-blue-500/[0.05] p-2 sm:p-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-blue-500/15 pb-1.5">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <ImagePlus size={13} strokeWidth={1.25} className="shrink-0 text-blue-400/90" />
                    <p className="text-sm font-semibold leading-tight">{head.prospectName}</p>
                    <span className="text-[9px] uppercase tracking-[0.18em] text-blue-300/85">
                      Screenshot import · {batch.length} lines
                    </span>
                  </div>
                  {hasImportBatchCol ? (
                    <button
                      type="button"
                      onClick={() => void handleDeleteImportBatch(group.batchId, head.prospectName, batch.length)}
                      disabled={deletingBatchId === group.batchId}
                      className="flex shrink-0 items-center gap-1 border border-rose-500/40 px-2 py-1 text-[9px] uppercase tracking-[0.18em] text-rose-300/95 transition hover:bg-rose-500/15 disabled:opacity-40"
                    >
                      {deletingBatchId === group.batchId ? (
                        <Loader2 size={11} className="animate-spin" strokeWidth={1.5} />
                      ) : (
                        <Trash2 size={11} strokeWidth={1.5} />
                      )}
                      Remove batch
                    </button>
                  ) : null}
                </div>
                <div className="mt-1.5 space-y-1.5">
                  {lineClusters.map((cluster, cIdx) => (
                    <div key={`${group.batchId}-c${cIdx}`} className="space-y-0.5">
                      <p
                        className={`px-0.5 text-[8px] uppercase tracking-[0.22em] ${
                          cluster.label === "Reaction"
                            ? "text-pink-300/90"
                            : "text-blue-200/75"
                        }`}
                      >
                        {cluster.label}
                      </p>
                      <div className="space-y-0.5">
                        {cluster.entries.map((entry) => (
                          <div key={entry.id} className="flex items-start gap-1">
                            <div
                              className={`min-w-0 flex-1 rounded-md border px-2 py-1 text-xs leading-snug text-[var(--rm-text)] ${batchLineBubbleClass(
                                entry
                              )}`}
                            >
                              <p className="text-[var(--rm-text)]">{entry.body}</p>
                              <p className="mt-0.5 text-[9px] uppercase tracking-wider text-[var(--rm-text-muted)]/90">
                                {entry.direction === "inbound" ? "Them" : "You"} · {formatTime(entry.createdAt)}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-center gap-0 pt-0.5">
                              <button
                                type="button"
                                onClick={() => handleOpenEditEntry(entry)}
                                className="flex h-6 w-6 items-center justify-center text-[var(--rm-text-muted)]/70 transition hover:text-[var(--rm-text)]"
                                aria-label="Edit line"
                                title="Edit"
                              >
                                <Pencil size={11} strokeWidth={1.5} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteEntry(entry)}
                                disabled={deletingId === entry.id}
                                className="flex h-6 w-6 items-center justify-center text-[var(--rm-text-muted)]/50 transition hover:text-rose-400 disabled:opacity-30"
                                aria-label="Delete line"
                                title="Delete this line only"
                              >
                                {deletingId === entry.id ? (
                                  <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
                                ) : (
                                  <Trash2 size={11} strokeWidth={1.5} />
                                )}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Manual Log Modal */}
      {isLogOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-8 sm:px-6">
          <div className="max-h-[min(92dvh,calc(100vh-2rem))] w-full max-w-md overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 pb-8 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">Log text or note</h2>
              <button type="button" onClick={() => setIsLogOpen(false)} className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">Close</button>
            </div>
            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                <span className={!selectedProspectId && logError ? "text-rose-400" : ""}>
                  Who {!selectedProspectId && logError ? "— pick someone" : ""}
                </span>
                <select
                  value={selectedProspectId}
                  onChange={(e) => { setSelectedProspectId(e.target.value); setLogError(null); }}
                  className={`mt-1 border bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)] ${
                    !selectedProspectId && logError ? "border-rose-500 ring-1 ring-rose-500/50" : "border-[var(--rm-border)]"
                  }`}
                >
                  <option value="">Select a prospect...</option>
                  {prospects.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.tier}-Tier)</option>))}
                </select>
              </label>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">Log as</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(EVENT_CONFIG) as EventType[]).map((type) => {
                    const cfg = EVENT_CONFIG[type];
                    const TypeIcon = cfg.icon;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setLogType(type)}
                        className={`flex items-center gap-1.5 border px-2 py-1.5 text-[10px] uppercase tracking-[0.15em] ${
                          logType === type ? cfg.colorClass : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
                        }`}
                      >
                        <TypeIcon size={11} strokeWidth={1.25} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] normal-case leading-snug text-[var(--rm-text-muted)]/90">
                  Text = thread-style context. Note = anything else you want the AI to remember (same data either way).
                </p>
              </div>
              <details className="rounded border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3">
                <summary className="cursor-pointer text-[10px] uppercase tracking-[0.25em] text-[var(--rm-text-muted)]">
                  When · defaults to now
                </summary>
                <label className="mt-3 flex flex-col gap-1 border-t border-[var(--rm-border)] pt-3 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                  <span className="flex items-center gap-1.5">
                    <Calendar size={11} strokeWidth={1.25} />
                    Time
                  </span>
                  <input
                    type="datetime-local"
                    value={logWhen}
                    onChange={(e) => setLogWhen(e.target.value)}
                    className="mt-1 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-2 text-sm normal-case text-[var(--rm-text)]"
                  />
                </label>
              </details>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                <span className={!logBody.trim() && logError?.includes("details") ? "text-rose-400" : ""}>
                  Details {!logBody.trim() && logError?.includes("details") ? "— add something" : ""}
                </span>
                <textarea
                  value={logBody} onChange={(e) => { setLogBody(e.target.value); setLogError(null); }} rows={3}
                  placeholder={
                    logType === "text"
                      ? "What was said or happening in the thread — paste or summarize; same idea as a screenshot import."
                      : "What you want remembered in plain English (date, call, vibe, context) — the AI reads the words, not the label."
                  }
                  className={`mt-1 border bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)] ${!logBody.trim() && logError?.includes("details") ? "border-rose-500 ring-1 ring-rose-500/50" : "border-[var(--rm-border)]"}`}
                />
              </label>
              {logError ? (<div className="border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400">{logError}</div>) : null}
              <button type="button" onClick={() => { setLogError(null); handleLogEntry(); }} disabled={isSending} className="flex w-full items-center justify-center gap-2 border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)] disabled:cursor-not-allowed disabled:opacity-60">
                {isSending ? "Saving..." : "Log It"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Screenshot Upload Modal — upload first, auto-read, one-tap add all */}
      {isScreenshotOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-8 sm:px-6">
          <div className="max-h-[min(92dvh,calc(100vh-2rem))] w-full max-w-md overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 pb-8 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">Screenshot</h2>
              <button type="button" onClick={resetScreenshotModal} className="text-[var(--rm-text-muted)]">
                <X size={18} strokeWidth={1.25} />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

              {!screenshotPreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 border-2 border-dashed border-blue-500/35 bg-blue-500/5 p-8 transition hover:border-blue-400/55"
                >
                  <ImagePlus size={32} strokeWidth={1} className="text-blue-400/80" />
                  <span className="text-xs uppercase tracking-[0.3em] text-blue-200/90">
                    Tap to choose screenshot
                  </span>
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <img src={screenshotPreview} alt="Screenshot" className="w-full border border-[var(--rm-border)]" />
                    {isParsing ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55">
                        <Loader2 size={22} strokeWidth={1.25} className="animate-spin text-blue-400" />
                        <span className="text-[10px] uppercase tracking-[0.25em] text-blue-200/95">Reading…</span>
                      </div>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => {
                        setScreenshotFile(null);
                        setScreenshotPreview(null);
                        setParsedMessages([]);
                        setScreenshotFilenameLabel("");
                        setScreenshotThreadTitle(null);
                        setScreenshotMatchSource(null);
                        setScreenshotError(null);
                      }}
                      className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center bg-black/75 text-white"
                      aria-label="Remove image"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  {screenshotFilenameLabel ? (
                    <p className="text-[10px] text-[var(--rm-text-muted)]">
                      <span className="uppercase tracking-[0.2em]">File</span> · {screenshotFilenameLabel}
                    </p>
                  ) : null}
                  {screenshotThreadTitle ? (
                    <p className="text-[10px] text-[var(--rm-text-muted)]">
                      <span className="uppercase tracking-[0.2em]">Chat header</span> · {screenshotThreadTitle}
                    </p>
                  ) : null}
                </div>
              )}

              {parsedMessages.length > 0 ? (
                <>
                  <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                    <span className={!screenshotProspectId && screenshotError ? "text-rose-400" : ""}>
                      Who is this thread with?
                    </span>
                    <select
                      value={screenshotProspectId}
                      onChange={(e) => {
                        setScreenshotProspectId(e.target.value);
                        setScreenshotError(null);
                        setScreenshotMatchSource(null);
                      }}
                      className={`mt-1 border bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)] ${
                        !screenshotProspectId && screenshotError ? "border-rose-500 ring-1 ring-rose-500/50" : "border-[var(--rm-border)]"
                      }`}
                    >
                      <option value="">Select…</option>
                      {prospects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.tier})
                        </option>
                      ))}
                    </select>
                  </label>
                  {screenshotMatchSource === "thread" && screenshotProspectId ? (
                    <p className="text-[10px] text-emerald-400/90">
                      Picked{" "}
                      <span className="font-medium text-emerald-200/95">
                        {prospects.find((p) => p.id === screenshotProspectId)?.name ?? "roster match"}
                      </span>{" "}
                      from the chat header{screenshotThreadTitle ? ` (“${screenshotThreadTitle}”)` : ""} — change if wrong.
                    </p>
                  ) : null}
                  {screenshotMatchSource === "filename" && screenshotProspectId ? (
                    <p className="text-[10px] text-emerald-400/90">
                      Matched roster from filename — change above if wrong.
                    </p>
                  ) : null}

                  <p className="text-[10px] text-[var(--rm-text-muted)]">
                    {parsedMessages.length} message{parsedMessages.length === 1 ? "" : "s"} · tap{" "}
                    <span className="text-sky-300/90">Flip</span> if a bubble is on the wrong side (fixes Home Active
                    Charisma).
                  </p>
                  <div className="max-h-52 space-y-1.5 overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3">
                    {parsedMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex flex-col gap-0.5 ${msg.direction === "outbound" ? "items-end" : "items-start"}`}
                      >
                        <div
                          className={`max-w-[85%] border border-transparent px-3 py-2 text-xs ${
                            msg.direction === "outbound"
                              ? "bg-blue-500/20 text-blue-200/95"
                              : "bg-[var(--rm-bg-elevated)] text-[var(--rm-text-muted)]"
                          }`}
                        >
                          {msg.body}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setParsedMessages((prev) =>
                              prev.map((m, j) =>
                                j === i
                                  ? {
                                      ...m,
                                      direction: m.direction === "inbound" ? "outbound" : "inbound",
                                    }
                                  : m
                              )
                            );
                          }}
                          className="text-[9px] uppercase tracking-[0.15em] text-sky-400/90 transition hover:text-sky-300"
                        >
                          Flip → {msg.direction === "outbound" ? "Them" : "You"}
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!screenshotProspectId) {
                        setScreenshotError("Pick who this thread is with.");
                        return;
                      }
                      void handleSaveScreenshotMessages();
                    }}
                    disabled={isSavingScreenshot}
                    className="flex w-full items-center justify-center gap-2 border border-emerald-500/50 bg-emerald-500/15 px-4 py-3 text-xs font-medium uppercase tracking-[0.28em] text-emerald-100/95 transition hover:bg-emerald-500/25 disabled:opacity-60"
                  >
                    {isSavingScreenshot ? "Saving…" : `Add ${parsedMessages.length} to log`}
                  </button>
                </>
              ) : null}

              {screenshotError ? (
                <div className="border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400">{screenshotError}</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit Log Entry Modal */}
      {isEditOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-8 sm:px-6">
          <div className="max-h-[min(92dvh,calc(100vh-2rem))] w-full max-w-md overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 pb-8 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">Edit Activity</h2>
              <button type="button" onClick={() => setIsEditOpen(false)} className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">Close</button>
            </div>
            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                Who
                <select
                  value={editProspectId}
                  onChange={(e) => setEditProspectId(e.target.value)}
                  className="mt-1 border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)]"
                >
                  <option value="">Select a prospect...</option>
                  {prospects.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.tier}-Tier)</option>))}
                </select>
              </label>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">Log as</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(EVENT_CONFIG) as EventType[]).map((type) => {
                    const cfg = EVENT_CONFIG[type];
                    const TypeIcon = cfg.icon;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setEditType(type)}
                        className={`flex items-center gap-1.5 border px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                          editType === type ? cfg.colorClass : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
                        }`}
                      >
                        <TypeIcon size={12} strokeWidth={1.25} />
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">Who sent this line</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setEditDirection("outbound")}
                    className={`border px-3 py-2 text-xs uppercase tracking-[0.2em] transition ${
                      editDirection === "outbound"
                        ? "border-sky-500/60 bg-sky-500/15 text-sky-200/95"
                        : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
                    }`}
                  >
                    You
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDirection("inbound")}
                    className={`border px-3 py-2 text-xs uppercase tracking-[0.2em] transition ${
                      editDirection === "inbound"
                        ? "border-slate-400/50 bg-slate-500/15 text-slate-200/95"
                        : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
                    }`}
                  >
                    Them
                  </button>
                </div>
                <p className="text-[10px] normal-case tracking-normal text-[var(--rm-text-muted)]">
                  Screenshot import sometimes flips sides — wrong choice here is why Home says “you texted last.”
                </p>
              </div>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                <span className="flex items-center gap-1.5"><Calendar size={12} strokeWidth={1.25} />When</span>
                <input type="datetime-local" value={editWhen} onChange={(e) => setEditWhen(e.target.value)} className="mt-1 border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)]" />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                Details
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={3}
                  className="mt-1 border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)]"
                />
              </label>
              {editError ? (<div className="border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400">{editError}</div>) : null}
              <button type="button" onClick={handleUpdateEntry} disabled={isUpdating} className="flex w-full items-center justify-center gap-2 border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)] disabled:cursor-not-allowed disabled:opacity-60">
                {isUpdating ? "Saving..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  const e = entries.find((x) => x.id === editingEntryId);
                  if (e) void handleDeleteEntry(e);
                }}
                disabled={isUpdating || deletingId === editingEntryId}
                className="flex w-full items-center justify-center gap-2 border border-rose-900/50 px-4 py-2 text-xs uppercase tracking-[0.3em] text-rose-400/90 transition hover:border-rose-700/60 hover:bg-rose-950/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={12} strokeWidth={1.5} />
                Delete log
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature={paywallFeature}
      />
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) {
    return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }
  const min = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
