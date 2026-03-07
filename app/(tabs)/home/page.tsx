"use client";

import React from "react";
import Link from "next/link";
import { Check, Edit2, MessageSquare, Save } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";

type UnreadItem = {
  id: string;
  name: string;
  phoneNumber?: string;
  receivedAt: string;
};

type DraftItem = {
  id: string;
  name: string;
  tier: "B" | "C";
  draftText: string;
};

export default function HomePage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(
    null
  );
  const [synopsis, setSynopsis] = React.useState("Awaiting AI summary...");
  const [loadingNarrative, setLoadingNarrative] = React.useState(true);
  const [unreadAList, setUnreadAList] = React.useState<UnreadItem[]>([]);
  const [draftDeck, setDraftDeck] = React.useState<DraftItem[]>([]);
  const [editingDraftId, setEditingDraftId] = React.useState<string | null>(null);
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [isApproving, setIsApproving] = React.useState(false);
  const [fadeDrafts, setFadeDrafts] = React.useState(false);

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

    const loadNarrative = async () => {
      try {
        const res = await fetch("/api/daily-narrative", { cache: "no-store" });
        const data = (await res.json()) as { synopsis?: string };
        setSynopsis(
          data.synopsis ??
            "No inbound A-Tier texts or successful B/C automations logged yet."
        );
      } catch {
        setSynopsis(
          "No inbound A-Tier texts or successful B/C automations logged yet."
        );
      } finally {
        setLoadingNarrative(false);
      }
    };

    const loadUnreadAList = async () => {
      const { data } = await client
        .from("messages")
        .select("id,created_at,prospects(name,phone_number,tier)")
        .eq("direction", "inbound")
        .eq("prospects.tier", "A")
        .order("created_at", { ascending: false })
        .limit(50);

      const mapped = (data ?? [])
        .map((row) => {
          const prospect = Array.isArray(row.prospects)
            ? row.prospects[0]
            : row.prospects;
          if (!prospect?.name) return null;
          return {
            id: row.id as string,
            name: prospect.name as string,
            phoneNumber: prospect.phone_number ?? undefined,
            receivedAt: row.created_at as string,
          };
        })
        .filter(Boolean) as UnreadItem[];

      const latestByProspect = new Map<string, UnreadItem>();
      mapped.forEach((item) => {
        if (!latestByProspect.has(item.name)) {
          latestByProspect.set(item.name, item);
        }
      });

      setUnreadAList(Array.from(latestByProspect.values()));
    };

    const loadDraftDeck = async () => {
      const { data } = await client
        .from("scheduled_replies")
        .select("id,draft_text,tier,prospects(name)")
        .eq("status", "scheduled")
        .in("tier", ["B", "C"])
        .limit(20);

      const mapped = (data ?? [])
        .map((row) => {
          const prospect = Array.isArray(row.prospects)
            ? row.prospects[0]
            : row.prospects;
          if (!prospect?.name) return null;
          return {
            id: row.id as string,
            name: prospect.name as string,
            tier: row.tier as "B" | "C",
            draftText: row.draft_text as string,
          };
        })
        .filter(Boolean) as DraftItem[];

      setDraftDeck(mapped);
      setDraftEdits(
        mapped.reduce((acc, item) => {
          acc[item.id] = item.draftText;
          return acc;
        }, {} as Record<string, string>)
      );
    };

    loadNarrative();
    loadUnreadAList();
    loadDraftDeck();
  }, []);

  const handleSaveDraft = async (draftId: string) => {
    const client = supabaseRef.current;
    if (!client) return;
    const draftText = draftEdits[draftId]?.trim();
    if (!draftText) return;

    const { error: updateError } = await client
      .from("scheduled_replies")
      .update({ draft_text: draftText })
      .eq("id", draftId);

    if (updateError) {
      setError("Failed to update draft.");
      return;
    }

    setDraftDeck((prev) =>
      prev.map((item) =>
        item.id === draftId ? { ...item, draftText } : item
      )
    );
    setEditingDraftId(null);
  };

  const handleApproveAll = async () => {
    if (draftDeck.length === 0) return;
    setIsApproving(true);
    setError(null);

    try {
      const res = await fetch("/api/approve-all", { method: "POST" });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok || payload.error) {
        setError(payload.error ?? "Failed to approve drafts.");
        setIsApproving(false);
        return;
      }

      setFadeDrafts(true);
      setSynopsis(
        "Automations dispatched. B/C-Tier replies sent with zero friction."
      );

      setTimeout(() => {
        setDraftDeck([]);
        setFadeDrafts(false);
        setIsApproving(false);
      }, 500);
    } catch {
      setError("Failed to approve drafts.");
      setIsApproving(false);
    }
  };

  return (
    <div className="rm-reveal space-y-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-wide">
            Roster Summary
          </h1>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.5em] text-[var(--rm-text-muted)]">
              AI Summary
            </p>
            <p className="text-sm text-[var(--rm-text-muted)]">
              {loadingNarrative ? "Generating summary..." : synopsis}
            </p>
          </div>
        </div>
        <Link
          href="/roster"
          className="border border-[var(--rm-border)] px-4 py-2 text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text)]"
        >
          {unreadAList.length + draftDeck.length} Prospects
        </Link>
      </header>

      {error ? (
        <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
          {error}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
            A-Tier Pending
          </p>
        </div>
        <div className="space-y-2 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
          {unreadAList.length === 0 ? (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Ava</p>
                <p className="text-xs text-[var(--rm-text-muted)]">12m ago</p>
              </div>
              <a
                href="sms:+15555551234"
                className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text)]"
              >
                <MessageSquare size={14} strokeWidth={1.25} />
                Text
              </a>
            </div>
          ) : (
            unreadAList.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{item.name}</p>
                  <p className="text-xs text-[var(--rm-text-muted)]">
                    {new Date(item.receivedAt).toLocaleString()}
                  </p>
                </div>
                <a
                  href={item.phoneNumber ? `sms:${item.phoneNumber}` : undefined}
                  className={`flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                    item.phoneNumber
                      ? "text-[var(--rm-text)]"
                      : "cursor-not-allowed text-[var(--rm-text-muted)]"
                  }`}
                >
                  <MessageSquare size={14} strokeWidth={1.25} />
                  Text
                </a>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
            Draft Deck
          </p>
          {draftDeck.length > 0 ? (
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={isApproving}
              className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Check size={14} strokeWidth={1.25} />
              {isApproving ? "Approving..." : "Approve All"}
            </button>
          ) : null}
        </div>
        <div className="space-y-3 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
          {draftDeck.length === 0 ? (
            <div
              className={`border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3 ${
                fadeDrafts ? "rm-fade-out" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Cora</p>
                <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                  C-Tier
                </span>
              </div>
              <p className="mt-2 text-xs text-[var(--rm-text-muted)]">
                Thanks for reaching out. I will reply when I can.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                >
                  <Edit2 size={14} strokeWidth={1.25} />
                  Edit
                </button>
                <button
                  type="button"
                  className="border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            draftDeck.map((draft) => (
              <div
                key={draft.id}
                className={`border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3 ${
                  fadeDrafts ? "rm-fade-out" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{draft.name}</p>
                  <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                    {draft.tier}-Tier
                  </span>
                </div>
                {editingDraftId === draft.id ? (
                  <textarea
                    value={draftEdits[draft.id] ?? draft.draftText}
                    onChange={(event) =>
                      setDraftEdits((prev) => ({
                        ...prev,
                        [draft.id]: event.target.value,
                      }))
                    }
                    rows={4}
                    className="mt-2 w-full border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-2 text-xs text-[var(--rm-text)]"
                  />
                ) : (
                  <p className="mt-2 text-xs text-[var(--rm-text-muted)]">
                    {draft.draftText}
                  </p>
                )}
                <div className="mt-3 flex items-center gap-2">
                  {editingDraftId === draft.id ? (
                    <button
                      type="button"
                      onClick={() => handleSaveDraft(draft.id)}
                      className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                    >
                      <Save size={14} strokeWidth={1.25} />
                      Save
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDraftId(draft.id)}
                      className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                    >
                      <Edit2 size={14} strokeWidth={1.25} />
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
