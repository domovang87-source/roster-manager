"use client";

import React from "react";
import Link from "next/link";
import { Check, Edit2, MessageSquare, Save } from "lucide-react";
import { formatScheduledFor } from "../../../lib/format-scheduled";
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
  phoneNumber?: string;
  scheduledFor: string | null;
};

type RecentConvoItem = {
  prospectId: string;
  name: string;
  lastMessageBody: string;
  lastMessageAt: string;
  direction: "inbound" | "outbound";
};

const DEMO_RECENT_CONVOS: RecentConvoItem[] = [
  {
    prospectId: "demo-ava",
    name: "Ava",
    lastMessageBody: "Hey! Are we still on for tonight?",
    lastMessageAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    direction: "inbound",
  },
  {
    prospectId: "demo-cora",
    name: "Cora",
    lastMessageBody: "I got you a coffee :)",
    lastMessageAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    direction: "outbound",
  },
];

const DEMO_SYNOPSIS =
  "Ava texted you that she's upset about something 12 mins ago. Might want to check on that. Autosending text to Cora in 2 hours.";

export default function HomePage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(
    null
  );
  const [synopsis, setSynopsis] = React.useState("Awaiting AI summary...");
  const [loadingNarrative, setLoadingNarrative] = React.useState(true);
  const [unreadAList, setUnreadAList] = React.useState<UnreadItem[]>([]);
  const [draftDeck, setDraftDeck] = React.useState<DraftItem[]>([]);
  const [recentConvos, setRecentConvos] = React.useState<RecentConvoItem[]>([]);
  const [rosterCount, setRosterCount] = React.useState<number>(0);
  const [exampleATierProspect, setExampleATierProspect] = React.useState<{
    name: string;
    phoneNumber?: string;
  } | null>(null);
  const [editingDraftId, setEditingDraftId] = React.useState<string | null>(null);
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [isApproving, setIsApproving] = React.useState(false);
  const [fadeDrafts, setFadeDrafts] = React.useState(false);
  const [exampleDraftText, setExampleDraftText] = React.useState(
    "You're the cutest."
  );
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);

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
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const res = await fetch("/api/daily-narrative", {
          cache: "no-store",
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = (await res.json()) as { synopsis?: string };
        setSynopsis(
          data.synopsis ??
            "Ava texted you that she's upset about something 12 mins ago. Might want to check on that. Autosending text to Cora in 2 hours."
        );
      } catch (_err) {
        setSynopsis(
          "Ava texted you that she's upset about something 12 mins ago. Might want to check on that. Autosending text to Cora in 2 hours."
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
      const [repliesRes, rulesRes] = await Promise.all([
        client
          .from("scheduled_replies")
          .select("id,draft_text,tier,scheduled_for,prospects(name,phone_number)")
          .eq("status", "scheduled")
          .in("tier", ["B", "C"])
          .limit(50),
        client
          .from("tier_rules")
          .select("tier,auto_respond")
          .in("tier", ["B", "C"]),
      ]);

      const rules = (rulesRes.data ?? []).reduce(
        (acc, r) => {
          acc[r.tier as "B" | "C"] = Boolean(r.auto_respond);
          return acc;
        },
        {} as Record<string, boolean>
      );

      const mapped = (repliesRes.data ?? [])
        .filter((row) => rules[row.tier as "B" | "C"] === true)
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
            phoneNumber: prospect.phone_number ?? undefined,
            scheduledFor: (row.scheduled_for as string | null) ?? null,
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

    const loadRosterCount = async () => {
      const { count } = await client
        .from("prospects")
        .select("*", { count: "exact", head: true });
      setRosterCount(count ?? 0);
    };

    const loadExampleATierProspect = async () => {
      const { data } = await client
        .from("prospects")
        .select("name,phone_number")
        .eq("tier", "A")
        .limit(1)
        .maybeSingle();
      if (data?.name) {
        setExampleATierProspect({
          name: data.name as string,
          phoneNumber: data.phone_number ?? undefined,
        });
      } else {
        setExampleATierProspect(null);
      }
    };

    const loadRecentConvos = async () => {
      const { data } = await client
        .from("messages")
        .select("id,body,created_at,direction,prospect_id,prospects(name)")
        .order("created_at", { ascending: false })
        .limit(200);

      const latestByProspect = new Map<string, RecentConvoItem>();
      for (const row of data ?? []) {
        const prospectId = row.prospect_id as string;
        if (latestByProspect.has(prospectId)) continue;
        const prospect = Array.isArray(row.prospects)
          ? row.prospects[0]
          : row.prospects;
        if (!prospect?.name) continue;
        const body = (row.body as string) || "";
        latestByProspect.set(prospectId, {
          prospectId,
          name: prospect.name as string,
          lastMessageBody: body.length > 80 ? `${body.slice(0, 80)}…` : body,
          lastMessageAt: row.created_at as string,
          direction: row.direction as "inbound" | "outbound",
        });
      }
      setRecentConvos(
        Array.from(latestByProspect.values()).sort(
          (a, b) =>
            new Date(b.lastMessageAt).getTime() -
            new Date(a.lastMessageAt).getTime()
        )
      );
    };

    loadNarrative();
    loadUnreadAList();
    loadDraftDeck();
    loadRecentConvos();
    loadRosterCount();
    loadExampleATierProspect();
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
        "Automations dispatched. B/C Tier replies sent with zero friction."
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

  const handleSubscribe = async () => {
    setIsCheckoutLoading(true);
    setError(null);
    try {
      const base =
        typeof window !== "undefined"
          ? window.location.origin
          : "http://localhost:3000";
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success_url: `${base}/home?success=1`,
          cancel_url: `${base}/home`,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? "Failed to start checkout.");
        return;
      }
      if (data.url) window.location.href = data.url;
    } catch {
      setError("Failed to start checkout.");
    } finally {
      setIsCheckoutLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-[0.35em]">
            STACK
          </h1>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.5em] text-[var(--rm-text-muted)]">
              AI Summary
            </p>
            <p className="text-sm text-[var(--rm-text-muted)]">
              {loadingNarrative ? "Generating summary..." : (recentConvos.length === 0 ? DEMO_SYNOPSIS : synopsis)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/roster"
            className="border border-[var(--rm-border)] px-4 py-2 text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text)]"
          >
            {rosterCount} Prospects
          </Link>
          <button
            type="button"
            onClick={handleSubscribe}
            disabled={isCheckoutLoading}
            className="border border-[var(--rm-text)] bg-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.4em] text-[var(--rm-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCheckoutLoading ? "Loading…" : "Subscribe"}
          </button>
        </div>
      </header>

      {error ? (
        <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] px-4 py-3 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
          {error}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
            A Tier Incoming
          </p>
        </div>
        <div className="space-y-2 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
          {unreadAList.length === 0 ? (
            exampleATierProspect ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{exampleATierProspect.name}</p>
                  <p className="text-xs text-[var(--rm-text-muted)]">No new messages</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const url = exampleATierProspect.phoneNumber
                      ? `sms:${exampleATierProspect.phoneNumber}`
                      : "sms:";
                    window.location.href = url;
                  }}
                  className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text)] transition hover:border-[var(--rm-text)]"
                >
                  <MessageSquare size={14} strokeWidth={1.25} />
                  Text
                </button>
              </div>
            ) : (
              <p className="text-xs text-[var(--rm-text-muted)]">No A-tier prospects yet.</p>
            )
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
            B/C Tier Outbound Text Drafts
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
                  C-Tier · {formatScheduledFor(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString())}
                </span>
              </div>
              {editingDraftId === "example" ? (
                <textarea
                  value={exampleDraftText}
                  onChange={(e) => setExampleDraftText(e.target.value)}
                  rows={4}
                  className="mt-2 w-full border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-2 text-xs text-[var(--rm-text)]"
                />
              ) : (
                <p className="mt-2 text-xs text-[var(--rm-text-muted)]">
                  {exampleDraftText}
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    window.location.href = `sms:+15555551234?body=${encodeURIComponent(exampleDraftText)}`;
                  }}
                  className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text)] transition hover:border-[var(--rm-text)]"
                >
                  <MessageSquare size={14} strokeWidth={1.25} />
                  Text
                </button>
                {editingDraftId === "example" ? (
                  <button
                    type="button"
                    onClick={() => setEditingDraftId(null)}
                    className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                  >
                    <Save size={14} strokeWidth={1.25} />
                    Done
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingDraftId("example")}
                    className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                  >
                    <Edit2 size={14} strokeWidth={1.25} />
                    Edit
                  </button>
                )}
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
                    {draft.tier}-Tier · {formatScheduledFor(draft.scheduledFor)}
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
                  <button
                    type="button"
                    onClick={() => {
                      const body = encodeURIComponent(draftEdits[draft.id] ?? draft.draftText);
                      const url = draft.phoneNumber
                        ? `sms:${draft.phoneNumber}?body=${body}`
                        : `sms:?body=${body}`;
                      window.location.href = url;
                    }}
                    className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text)] transition hover:border-[var(--rm-text)]"
                  >
                    <MessageSquare size={14} strokeWidth={1.25} />
                    Text
                  </button>
                  {editingDraftId === draft.id ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSaveDraft(draft.id)}
                        className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                      >
                        <Save size={14} strokeWidth={1.25} />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingDraftId(null)}
                        className="border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                      >
                        Cancel
                      </button>
                    </>
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
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
          Recent Convos
        </p>
        <div className="space-y-2 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
          {(recentConvos.length === 0 ? DEMO_RECENT_CONVOS : recentConvos).map((convo) => (
            <Link
              key={convo.prospectId}
              href="/roster"
              className="flex items-start justify-between gap-3 border-b border-[var(--rm-border)] pb-2 last:border-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{convo.name}</p>
                <p className="truncate text-xs text-[var(--rm-text-muted)]">
                  {convo.lastMessageBody || "(no preview)"}
                </p>
              </div>
              <p className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                {formatRelativeTime(convo.lastMessageAt)}
              </p>
            </Link>
          ))}
        </div>
      </section>
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
