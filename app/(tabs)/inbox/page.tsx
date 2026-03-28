"use client";

import React from "react";
import { MessageSquare, Heart, Phone, Users, StickyNote, Plus, Calendar, ImagePlus, X, Loader2, Pencil } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";

type EventType = "text" | "date" | "hangout" | "call" | "note";

const EVENT_CONFIG: Record<EventType, { label: string; icon: typeof MessageSquare; colorClass: string }> = {
  text: { label: "Text", icon: MessageSquare, colorClass: "text-blue-400 border-blue-400/40" },
  date: { label: "Date", icon: Heart, colorClass: "text-rose-400 border-rose-400/40" },
  hangout: { label: "Hung out", icon: Users, colorClass: "text-amber-400 border-amber-400/40" },
  call: { label: "Call", icon: Phone, colorClass: "text-emerald-400 border-emerald-400/40" },
  note: { label: "Note", icon: StickyNote, colorClass: "text-purple-400 border-purple-400/40" },
};

type Prospect = { id: string; name: string; tier: string };

type LogEntry = {
  id: string;
  prospectId: string;
  prospectName: string;
  eventType: EventType;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
};

type ParsedMessage = { direction: string; body: string };

function isReactionBody(body: string): boolean {
  return body.trim().toLowerCase().startsWith("reacted ");
}

function toLocalDatetimeString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ActivityLogPage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [hasEventTypeCol, setHasEventTypeCol] = React.useState(true);
  const [entries, setEntries] = React.useState<LogEntry[]>([]);
  const [prospects, setProspects] = React.useState<Prospect[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [filterProspectId, setFilterProspectId] = React.useState("");

  // Manual log modal
  const [isLogOpen, setIsLogOpen] = React.useState(false);
  const [selectedProspectId, setSelectedProspectId] = React.useState("");
  const [logBody, setLogBody] = React.useState("");
  const [logType, setLogType] = React.useState<EventType>("text");
  const [logWhen, setLogWhen] = React.useState(() => toLocalDatetimeString(new Date()));
  const [isSending, setIsSending] = React.useState(false);
  const [logError, setLogError] = React.useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(null);
  const [editProspectId, setEditProspectId] = React.useState("");
  const [editType, setEditType] = React.useState<EventType>("text");
  const [editBody, setEditBody] = React.useState("");
  const [editWhen, setEditWhen] = React.useState(() => toLocalDatetimeString(new Date()));
  const [isUpdating, setIsUpdating] = React.useState(false);
  const [editError, setEditError] = React.useState<string | null>(null);

  // Screenshot modal
  const [isScreenshotOpen, setIsScreenshotOpen] = React.useState(false);
  const [screenshotProspectId, setScreenshotProspectId] = React.useState("");
  const [screenshotWhen, setScreenshotWhen] = React.useState(() => toLocalDatetimeString(new Date()));
  const [screenshotPreview, setScreenshotPreview] = React.useState<string | null>(null);
  const [screenshotFile, setScreenshotFile] = React.useState<File | null>(null);
  const [isParsing, setIsParsing] = React.useState(false);
  const [parsedMessages, setParsedMessages] = React.useState<ParsedMessage[]>([]);
  const [selectedParsedIdx, setSelectedParsedIdx] = React.useState<Set<number>>(new Set());
  const [isSavingScreenshot, setIsSavingScreenshot] = React.useState(false);
  const [screenshotError, setScreenshotError] = React.useState<string | null>(null);

  const loadEntries = React.useCallback(async (client: NonNullable<ReturnType<typeof getSupabaseClient>>) => {
    const { data, error: queryError } = await client
      .from("messages")
      .select("id,body,direction,event_type,created_at,prospect_id,prospects(name)")
      .order("created_at", { ascending: false })
      .limit(200);

    if (queryError && queryError.message?.includes("event_type")) {
      setHasEventTypeCol(false);
      const { data: fallbackData } = await client
        .from("messages")
        .select("id,body,direction,created_at,prospect_id,prospects(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      setEntries(
        (fallbackData ?? []).map((row) => {
          const prospect = Array.isArray(row.prospects) ? row.prospects[0] : row.prospects;
          return {
            id: row.id as string,
            prospectId: row.prospect_id as string,
            prospectName: (prospect?.name as string) || "Unknown",
            eventType: "text" as EventType,
            direction: (row.direction as "inbound" | "outbound") || "outbound",
            body: (row.body as string) || "",
            createdAt: row.created_at as string,
          };
        })
      );
      return;
    }

    setEntries(
      (data ?? []).map((row) => {
        const prospect = Array.isArray(row.prospects) ? row.prospects[0] : row.prospects;
        return {
          id: row.id as string,
          prospectId: row.prospect_id as string,
          prospectName: (prospect?.name as string) || "Unknown",
          eventType: (row.event_type as EventType) || "text",
          direction: (row.direction as "inbound" | "outbound") || "outbound",
          body: (row.body as string) || "",
          createdAt: row.created_at as string,
        };
      })
    );
  }, []);

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

  // Manual log handler
  const handleLogEntry = async () => {
    const client = supabaseRef.current;
    if (!client) return;
    if (!selectedProspectId) { setLogError("Pick who this is about"); return; }
    if (!logBody.trim()) { setLogError("Add some details about what happened"); return; }

    setIsSending(true);
    setLogError(null);
    const whenDate = new Date(logWhen);
    const createdAt = isNaN(whenDate.getTime()) ? new Date().toISOString() : whenDate.toISOString();

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
    setLogBody("");
    setLogWhen(toLocalDatetimeString(new Date()));
    setIsLogOpen(false);
    setIsSending(false);
    await loadEntries(client);
  };

  // Screenshot handlers
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScreenshotFile(file);
    setScreenshotPreview(URL.createObjectURL(file));
    setParsedMessages([]);
    setSelectedParsedIdx(new Set());
    setScreenshotError(null);
  };

  const handleParseScreenshot = async () => {
    if (!screenshotFile) return;
    setIsParsing(true);
    setScreenshotError(null);

    const formData = new FormData();
    formData.append("image", screenshotFile);

    try {
      const res = await fetch("/api/parse-screenshot", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok || data.error) {
        setScreenshotError(data.error ?? "Failed to read screenshot");
        setIsParsing(false);
        return;
      }
      setParsedMessages(data.messages ?? []);
      setSelectedParsedIdx(new Set((data.messages ?? []).map((_: ParsedMessage, i: number) => i)));
      if ((data.messages ?? []).length === 0) {
        setScreenshotError("Couldn't find any messages in this screenshot. Try a clearer one.");
      }
    } catch {
      setScreenshotError("Failed to analyze screenshot");
    } finally {
      setIsParsing(false);
    }
  };

  const handleSaveScreenshotMessages = async () => {
    const client = supabaseRef.current;
    if (!client || !screenshotProspectId || parsedMessages.length === 0) return;
    const selectedMessages = parsedMessages.filter((_, i) => selectedParsedIdx.has(i));
    if (selectedMessages.length === 0) {
      setScreenshotError("Pick at least one parsed message to save.");
      return;
    }

    setIsSavingScreenshot(true);
    setScreenshotError(null);

    const whenDate = new Date(screenshotWhen);
    const nowMs = Date.now();
    const parsedMs = isNaN(whenDate.getTime()) ? nowMs : whenDate.getTime();
    const baseMs = Math.min(parsedMs, nowMs);
    const rows = selectedMessages.map((msg, idx) => {
      const row: Record<string, unknown> = {
        prospect_id: screenshotProspectId,
        direction: msg.direction === "inbound" ? "inbound" : "outbound",
        body: msg.body,
        // Keep relative ordering while letting user backdate screenshot imports.
        created_at: new Date(baseMs + idx * 60_000).toISOString(),
      };
      if (hasEventTypeCol) row.event_type = "text";
      return row;
    });

    const { error: insertError } = await client.from("messages").insert(rows);
    if (insertError) {
      setScreenshotError(insertError.message);
      setIsSavingScreenshot(false);
      return;
    }

    setIsScreenshotOpen(false);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setParsedMessages([]);
    setSelectedParsedIdx(new Set());
    setScreenshotProspectId("");
    setScreenshotWhen(toLocalDatetimeString(new Date()));
    setIsSavingScreenshot(false);
    await loadEntries(client);
  };

  const resetScreenshotModal = () => {
    setIsScreenshotOpen(false);
    setScreenshotFile(null);
    setScreenshotPreview(null);
    setParsedMessages([]);
    setSelectedParsedIdx(new Set());
    setScreenshotError(null);
    setScreenshotProspectId("");
    setScreenshotWhen(toLocalDatetimeString(new Date()));
  };

  const handleOpenEditEntry = (entry: LogEntry) => {
    setEditingEntryId(entry.id);
    setEditProspectId(entry.prospectId);
    setEditType(entry.eventType);
    setEditBody(entry.body);
    setEditWhen(toLocalDatetimeString(new Date(entry.createdAt)));
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

  const filtered = filterProspectId
    ? entries.filter((e) => e.prospectId === filterProspectId)
    : entries;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-wide">Activity Log</h1>
          <p className="text-sm text-[var(--rm-text-muted)]">
            Track interactions. The AI reads this when drafting texts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setScreenshotError(null);
              setParsedMessages([]);
              setScreenshotFile(null);
              setScreenshotPreview(null);
              setScreenshotProspectId(filterProspectId);
              setScreenshotWhen(toLocalDatetimeString(new Date()));
              setIsScreenshotOpen(true);
            }}
            className="flex items-center gap-2 border border-blue-400/50 px-4 py-2 text-xs uppercase tracking-[0.3em] text-blue-400 transition hover:border-blue-400 hover:bg-blue-400/10"
          >
            <ImagePlus size={14} strokeWidth={1.25} />
            Screenshot
          </button>
          <button
            type="button"
            onClick={() => {
              setLogWhen(toLocalDatetimeString(new Date()));
              setLogError(null);
              setSelectedProspectId(filterProspectId);
              setIsLogOpen(true);
            }}
            className="flex items-center gap-2 border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)]"
          >
            <Plus size={14} strokeWidth={1.25} />
            Log
          </button>
        </div>
      </header>

      {error ? (
        <div className="border border-rose-500/40 bg-[var(--rm-bg-elevated)] p-4 text-sm text-rose-400">
          {error}
        </div>
      ) : null}

      {!hasEventTypeCol ? (
        <div className="border border-amber-500/40 bg-[var(--rm-bg-elevated)] p-4 text-sm text-amber-400">
          Run <code className="font-mono text-xs">activity-log-migration.sql</code> in your Supabase SQL Editor to enable event types.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilterProspectId("")}
          className={`border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
            !filterProspectId ? "border-[var(--rm-text)] text-[var(--rm-text)]" : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
          }`}
        >
          All
        </button>
        {prospects.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setFilterProspectId(p.id)}
            className={`border px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
              filterProspectId === p.id ? "border-[var(--rm-text)] text-[var(--rm-text)]" : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
            }`}
          >
            {p.name}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6 text-center">
            <p className="text-sm text-[var(--rm-text-muted)]">
              No activity yet. Upload a screenshot or tap "+ Log" to start.
            </p>
          </div>
        ) : (
          filtered.map((entry) => {
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{entry.prospectName}</p>
                      <span className={`text-[10px] uppercase tracking-[0.2em] ${config.colorClass.split(" ")[0]}`}>
                        {config.label}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                      {formatTime(entry.createdAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenEditEntry(entry)}
                      className="ml-2 text-[var(--rm-text-muted)]/70 transition hover:text-[var(--rm-text)]"
                      aria-label="Edit entry"
                      title="Edit"
                    >
                      <Pencil size={12} strokeWidth={1.5} />
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-[var(--rm-text-muted)]">{entry.body}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Manual Log Modal */}
      {isLogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="max-h-[calc(100vh-6rem)] w-full max-w-md overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6 pb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">Log Activity</h2>
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
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">What happened</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(EVENT_CONFIG) as EventType[]).map((type) => {
                    const cfg = EVENT_CONFIG[type];
                    const TypeIcon = cfg.icon;
                    return (
                      <button key={type} type="button" onClick={() => setLogType(type)} className={`flex items-center gap-1.5 border px-3 py-2 text-xs uppercase tracking-[0.2em] ${logType === type ? cfg.colorClass : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"}`}>
                        <TypeIcon size={12} strokeWidth={1.25} />{cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                <span className="flex items-center gap-1.5"><Calendar size={12} strokeWidth={1.25} />When</span>
                <input type="datetime-local" value={logWhen} onChange={(e) => setLogWhen(e.target.value)} className="mt-1 border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)]" />
              </label>
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                <span className={!logBody.trim() && logError?.includes("details") ? "text-rose-400" : ""}>
                  Details {!logBody.trim() && logError?.includes("details") ? "— add something" : ""}
                </span>
                <textarea
                  value={logBody} onChange={(e) => { setLogBody(e.target.value); setLogError(null); }} rows={3}
                  placeholder={logType === "text" ? "What was the convo about?" : logType === "date" ? "Where'd you go? How was it?" : logType === "call" ? "What did you talk about?" : logType === "hangout" ? "What did you do?" : "Anything you want the AI to remember"}
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

      {/* Screenshot Upload Modal */}
      {isScreenshotOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="max-h-[calc(100vh-6rem)] w-full max-w-md overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6 pb-8">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">Upload Screenshot</h2>
              <button type="button" onClick={resetScreenshotModal} className="text-[var(--rm-text-muted)]">
                <X size={18} strokeWidth={1.25} />
              </button>
            </div>

            <p className="mt-2 text-xs text-[var(--rm-text-muted)]">
              Drop a screenshot of your texts. AI will read the messages and add them to the log.
            </p>

            <div className="mt-4 space-y-4">
              {/* Who */}
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                <span className={!screenshotProspectId && screenshotError ? "text-rose-400" : ""}>
                  Who is this convo with? {!screenshotProspectId && screenshotError?.includes("Pick") ? "— pick someone" : ""}
                </span>
                <select
                  value={screenshotProspectId}
                  onChange={(e) => { setScreenshotProspectId(e.target.value); setScreenshotError(null); }}
                  className={`mt-1 border bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)] ${
                    !screenshotProspectId && screenshotError?.includes("Pick") ? "border-rose-500 ring-1 ring-rose-500/50" : "border-[var(--rm-border)]"
                  }`}
                >
                  <option value="">Select a prospect...</option>
                  {prospects.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.tier}-Tier)</option>))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} strokeWidth={1.25} />
                  When did this encounter happen
                </span>
                <input
                  type="datetime-local"
                  value={screenshotWhen}
                  onChange={(e) => setScreenshotWhen(e.target.value)}
                  className="mt-1 border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)]"
                />
                {new Date(screenshotWhen).getTime() > Date.now() ? (
                  <span className="mt-1 text-[10px] normal-case text-amber-400">
                    Future time detected; save will clamp to current time.
                  </span>
                ) : null}
              </label>

              {/* File upload area */}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />

              {!screenshotPreview ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 border-2 border-dashed border-[var(--rm-border)] p-8 transition hover:border-blue-400/50"
                >
                  <ImagePlus size={32} strokeWidth={1} className="text-[var(--rm-text-muted)]" />
                  <span className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                    Tap to select screenshot
                  </span>
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="relative">
                    <img src={screenshotPreview} alt="Screenshot" className="w-full border border-[var(--rm-border)]" />
                    <button
                      type="button"
                      onClick={() => { setScreenshotFile(null); setScreenshotPreview(null); setParsedMessages([]); setScreenshotError(null); }}
                      className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center bg-black/70 text-white"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {parsedMessages.length === 0 && !isParsing ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!screenshotProspectId) { setScreenshotError("Pick who this convo is with first"); return; }
                        handleParseScreenshot();
                      }}
                      disabled={isParsing}
                      className="flex w-full items-center justify-center gap-2 border border-blue-400 px-4 py-2 text-xs uppercase tracking-[0.3em] text-blue-400 transition hover:bg-blue-400/10"
                    >
                      <MessageSquare size={14} strokeWidth={1.25} />
                      Read Messages
                    </button>
                  ) : null}
                </div>
              )}

              {/* Parsing state */}
              {isParsing ? (
                <div className="flex items-center justify-center gap-3 py-4">
                  <Loader2 size={18} strokeWidth={1.25} className="animate-spin text-blue-400" />
                  <span className="text-xs uppercase tracking-[0.3em] text-blue-400">Reading texts...</span>
                </div>
              ) : null}

              {/* Parsed messages preview */}
              {parsedMessages.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                    Found {parsedMessages.length} messages — select what to save
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedParsedIdx(new Set(parsedMessages.map((_, i) => i)))}
                      className="border border-[var(--rm-border)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedParsedIdx(new Set())}
                      className="border border-[var(--rm-border)] px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-60 space-y-1.5 overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3">
                    {parsedMessages.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          onClick={() => {
                            setSelectedParsedIdx((prev) => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            });
                          }}
                          className={`max-w-[80%] cursor-pointer border px-3 py-2 text-xs ${
                            msg.direction === "outbound"
                              ? "bg-blue-500/20 text-blue-300"
                              : "bg-[var(--rm-bg-elevated)] text-[var(--rm-text-muted)]"
                          } ${
                            selectedParsedIdx.has(i)
                              ? "border-[var(--rm-text)]"
                              : "border-transparent opacity-60"
                          }`}
                        >
                          {msg.body}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveScreenshotMessages}
                    disabled={isSavingScreenshot || selectedParsedIdx.size === 0}
                    className="flex w-full items-center justify-center gap-2 border border-[var(--rm-text)] bg-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--rm-bg)] transition hover:opacity-90 disabled:opacity-60"
                  >
                    {isSavingScreenshot ? "Saving..." : `Save ${selectedParsedIdx.size} Message${selectedParsedIdx.size === 1 ? "" : "s"}`}
                  </button>
                </div>
              ) : null}

              {/* Error */}
              {screenshotError ? (
                <div className="border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-400">
                  {screenshotError}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Edit Log Entry Modal */}
      {isEditOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-md border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6">
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
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">What happened</p>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(EVENT_CONFIG) as EventType[]).map((type) => {
                    const cfg = EVENT_CONFIG[type];
                    const TypeIcon = cfg.icon;
                    return (
                      <button key={type} type="button" onClick={() => setEditType(type)} className={`flex items-center gap-1.5 border px-3 py-2 text-xs uppercase tracking-[0.2em] ${editType === type ? cfg.colorClass : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"}`}>
                        <TypeIcon size={12} strokeWidth={1.25} />{cfg.label}
                      </button>
                    );
                  })}
                </div>
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
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
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
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
