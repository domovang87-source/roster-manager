"use client";

import React from "react";
import { MessageSquare, Plus, Send } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";

type Prospect = {
  id: string;
  name: string;
  tier: string;
  phoneNumber?: string;
};

type MessageRow = {
  id: string;
  prospectId: string;
  prospectName: string;
  direction: "inbound" | "outbound";
  body: string;
  createdAt: string;
};

export default function InboxPage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const [messages, setMessages] = React.useState<MessageRow[]>([]);
  const [prospects, setProspects] = React.useState<Prospect[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [isLogOpen, setIsLogOpen] = React.useState(false);
  const [selectedProspectId, setSelectedProspectId] = React.useState("");
  const [logBody, setLogBody] = React.useState("");
  const [logDirection, setLogDirection] = React.useState<"inbound" | "outbound">("inbound");
  const [isSending, setIsSending] = React.useState(false);

  const loadMessages = React.useCallback(async () => {
    const client = supabaseRef.current;
    if (!client) return;

    const { data } = await client
      .from("messages")
      .select("id,body,direction,created_at,prospect_id,prospects(name)")
      .order("created_at", { ascending: false })
      .limit(100);

    setMessages(
      (data ?? []).map((row) => {
        const prospect = Array.isArray(row.prospects)
          ? row.prospects[0]
          : row.prospects;
        return {
          id: row.id as string,
          prospectId: row.prospect_id as string,
          prospectName: (prospect?.name as string) || "Unknown",
          direction: row.direction as "inbound" | "outbound",
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
      const missingParts = [
        !config.urlPresent ? "URL" : null,
        !config.keyPresent ? "Anon key" : null,
      ].filter(Boolean).join(" & ");
      setError(`Supabase is not configured (${missingParts} missing).`);
      return;
    }

    const loadProspects = async () => {
      const { data } = await client
        .from("prospects")
        .select("id,name,tier,phone_number");
      setProspects(
        (data ?? []).map((r) => ({
          id: String(r.id),
          name: r.name ?? "Unknown",
          tier: (r.tier as string) ?? "C",
          phoneNumber: r.phone_number ?? undefined,
        }))
      );
    };

    loadProspects();
    loadMessages();
  }, [loadMessages]);

  const handleLogMessage = async () => {
    const client = supabaseRef.current;
    if (!client || !selectedProspectId || !logBody.trim()) return;

    setIsSending(true);
    setError(null);

    const { error: insertError } = await client
      .from("messages")
      .insert({
        prospect_id: selectedProspectId,
        direction: logDirection,
        body: logBody.trim(),
      });

    if (insertError) {
      setError("Failed to log message.");
      setIsSending(false);
      return;
    }

    setLogBody("");
    setIsLogOpen(false);
    setIsSending(false);
    await loadMessages();
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-wide">Inbox</h1>
          <p className="text-sm text-[var(--rm-text-muted)]">
            All messages across your roster.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsLogOpen(true)}
          className="flex items-center gap-2 border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)]"
        >
          <Plus size={14} strokeWidth={1.25} />
          Log a Text
        </button>
      </header>

      {error ? (
        <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 text-sm text-[var(--rm-text-muted)]">
          {error}
        </div>
      ) : null}

      <div className="space-y-2">
        {messages.length === 0 ? (
          <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6 text-center">
            <MessageSquare size={32} strokeWidth={1} className="mx-auto text-[var(--rm-text-muted)]" />
            <p className="mt-3 text-sm text-[var(--rm-text-muted)]">
              No messages yet. Tap "Log a Text" to add one.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className="flex items-start gap-3 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-3"
            >
              <div
                className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  msg.direction === "inbound" ? "bg-blue-400" : "bg-emerald-400"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{msg.prospectName}</p>
                  <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                    {msg.direction === "inbound" ? "Received" : "Sent"}
                    {" · "}
                    {formatTime(msg.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--rm-text-muted)]">{msg.body}</p>
              </div>
            </div>
          ))
        )}
      </div>

      {isLogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-md border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">
                Log a Text
              </h2>
              <button
                type="button"
                onClick={() => setIsLogOpen(false)}
                className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                Who
                <select
                  value={selectedProspectId}
                  onChange={(e) => setSelectedProspectId(e.target.value)}
                  className="mt-1 border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)]"
                >
                  <option value="">Select a prospect...</option>
                  {prospects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.tier}-Tier)
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLogDirection("inbound")}
                  className={`flex-1 border px-3 py-2 text-xs uppercase tracking-[0.3em] ${
                    logDirection === "inbound"
                      ? "border-blue-400 text-blue-400"
                      : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
                  }`}
                >
                  They sent me
                </button>
                <button
                  type="button"
                  onClick={() => setLogDirection("outbound")}
                  className={`flex-1 border px-3 py-2 text-xs uppercase tracking-[0.3em] ${
                    logDirection === "outbound"
                      ? "border-emerald-400 text-emerald-400"
                      : "border-[var(--rm-border)] text-[var(--rm-text-muted)]"
                  }`}
                >
                  I sent them
                </button>
              </div>

              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                Message
                <textarea
                  value={logBody}
                  onChange={(e) => setLogBody(e.target.value)}
                  rows={4}
                  placeholder="Paste or type the message..."
                  className="mt-1 border border-[var(--rm-border)] bg-[var(--rm-bg)] p-2 text-sm normal-case text-[var(--rm-text)]"
                />
              </label>

              <button
                type="button"
                onClick={handleLogMessage}
                disabled={isSending || !selectedProspectId || !logBody.trim()}
                className="flex w-full items-center justify-center gap-2 border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send size={14} strokeWidth={1.25} />
                {isSending ? "Saving..." : "Log Message"}
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
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
