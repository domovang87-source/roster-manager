"use client";

import React from "react";
import Link from "next/link";
import { Clipboard, Edit2, MessageSquare, Save } from "lucide-react";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";

type Tier = "A" | "B" | "C";

type TierProspect = {
  id: string;
  name: string;
  tier: Tier;
  phoneNumber?: string;
  lastInboundBody?: string;
  lastInboundAt?: string;
  draftId?: string;
  draftText?: string;
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
    prospectId: "demo-theo",
    name: "Theo",
    lastMessageBody: "Yo we should link this weekend",
    lastMessageAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    direction: "inbound",
  },
  {
    prospectId: "demo-marek",
    name: "Marek",
    lastMessageBody: "For sure, let me know when you're free",
    lastMessageAt: new Date(Date.now() - 3 * 7 * 24 * 60 * 60 * 1000).toISOString(),
    direction: "outbound",
  },
];

const DEMO_SYNOPSIS =
  "Theo texted 12 mins ago — wants to link this weekend. Haven't talked to Marek in 3 weeks, might be time to reach out.";

export default function HomePage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(null);
  const [synopsis, setSynopsis] = React.useState("Awaiting AI summary...");
  const [loadingNarrative, setLoadingNarrative] = React.useState(true);
  const [tierProspects, setTierProspects] = React.useState<Record<Tier, TierProspect[]>>({ A: [], B: [], C: [] });
  const [recentConvos, setRecentConvos] = React.useState<RecentConvoItem[]>([]);
  const [rosterCount, setRosterCount] = React.useState(0);
  const [editingDraftId, setEditingDraftId] = React.useState<string | null>(null);
  const [draftEdits, setDraftEdits] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const [isCheckoutLoading, setIsCheckoutLoading] = React.useState(false);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
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
        setSynopsis(data.synopsis ?? DEMO_SYNOPSIS);
      } catch {
        setSynopsis(DEMO_SYNOPSIS);
      } finally {
        setLoadingNarrative(false);
      }
    };

    const loadTierProspects = async () => {
      const [prospectsRes, messagesRes, draftsRes] = await Promise.all([
        client.from("prospects").select("id,name,tier,phone_number"),
        client.from("messages").select("id,body,created_at,direction,prospect_id").eq("direction", "inbound").order("created_at", { ascending: false }).limit(200),
        client.from("scheduled_replies").select("id,draft_text,prospect_id").eq("status", "scheduled").limit(100),
      ]);

      const latestInbound = new Map<string, { body: string; at: string }>();
      for (const row of messagesRes.data ?? []) {
        const pid = row.prospect_id as string;
        if (!latestInbound.has(pid)) {
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
          lastInboundBody: inbound?.body,
          lastInboundAt: inbound?.at,
          draftId: draft?.id,
          draftText: draft?.text,
        };
        result[tier].push(p);
        if (draft) edits[draft.id] = draft.text;
      }

      setTierProspects(result);
      setDraftEdits(edits);
      setRosterCount((prospectsRes.data ?? []).length);
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
        const prospect = Array.isArray(row.prospects) ? row.prospects[0] : row.prospects;
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
          (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
        )
      );
    };

    loadNarrative();
    loadTierProspects();
    loadRecentConvos();
  }, []);

  const handleSaveDraft = async (draftId: string) => {
    const client = supabaseRef.current;
    if (!client) return;
    const text = draftEdits[draftId]?.trim();
    if (!text) return;

    const { error: updateError } = await client
      .from("scheduled_replies")
      .update({ draft_text: text })
      .eq("id", draftId);

    if (updateError) {
      setError("Failed to update draft.");
      return;
    }
    setEditingDraftId(null);
  };

  const handleGenerateDraft = async (prospect: TierProspect) => {
    setIsGenerating(prospect.id);
    setError(null);
    try {
      const res = await fetch("/api/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: prospect.tier,
          name: prospect.name,
          vibeNotes: "",
          incomingText: prospect.lastInboundBody || "Hey",
        }),
      });
      const data = await res.json();
      const draftText = data.suggestedReply ?? data.autoReply ?? "";
      if (!draftText) return;

      const client = supabaseRef.current;
      if (!client) return;

      const { data: inserted } = await client
        .from("scheduled_replies")
        .insert({ prospect_id: prospect.id, tier: prospect.tier, draft_text: draftText, status: "scheduled" })
        .select("id,draft_text")
        .single();

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success_url: `${base}/home?success=1`, cancel_url: `${base}/home` }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || data.error) { setError(data.error ?? "Failed to start checkout."); return; }
      if (data.url) window.location.href = data.url;
    } catch { setError("Failed to start checkout."); } finally { setIsCheckoutLoading(false); }
  };

  const tierOrder: Tier[] = ["A", "B", "C"];
  const tierLabels: Record<Tier, string> = { A: "A Tier", B: "B Tier", C: "C Tier" };

  return (
    <div className="space-y-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-[0.35em]">STACK</h1>
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.5em] text-[var(--rm-text-muted)]">AI Summary</p>
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

      {tierOrder.map((tier) => (
        <section key={tier} className="space-y-3">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
            {tierLabels[tier]}
          </p>
          <div className="space-y-3 border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4">
            {tierProspects[tier].length === 0 ? (
              <p className="text-xs text-[var(--rm-text-muted)]">
                No {tierLabels[tier]} prospects yet.
              </p>
            ) : (
              tierProspects[tier].map((prospect) => {
                const draftId = prospect.draftId;
                const currentDraft = draftId ? (draftEdits[draftId] ?? prospect.draftText ?? "") : "";
                const isEditing = editingDraftId === draftId;
                const generating = isGenerating === prospect.id;

                return (
                  <div
                    key={prospect.id}
                    className="border border-[var(--rm-border)] bg-[var(--rm-bg)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">{prospect.name}</p>
                      {prospect.lastInboundAt ? (
                        <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
                          {formatRelativeTime(prospect.lastInboundAt)}
                        </span>
                      ) : null}
                    </div>

                    {prospect.lastInboundBody ? (
                      <p className="mt-1 text-xs text-[var(--rm-text-muted)]">
                        "{prospect.lastInboundBody.length > 80 ? `${prospect.lastInboundBody.slice(0, 80)}…` : prospect.lastInboundBody}"
                      </p>
                    ) : null}

                    {draftId && currentDraft ? (
                      <>
                        {isEditing ? (
                          <textarea
                            value={currentDraft}
                            onChange={(e) => setDraftEdits((prev) => ({ ...prev, [draftId]: e.target.value }))}
                            rows={3}
                            className="mt-2 w-full border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-2 text-xs text-[var(--rm-text)]"
                          />
                        ) : (
                          <p className="mt-2 text-xs text-[var(--rm-text)]">
                            Draft: {currentDraft}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const body = encodeURIComponent(currentDraft);
                              const url = prospect.phoneNumber ? `sms:${prospect.phoneNumber}?body=${body}` : `sms:?body=${body}`;
                              window.location.href = url;
                            }}
                            className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text)] transition hover:border-[var(--rm-text)]"
                          >
                            <MessageSquare size={14} strokeWidth={1.25} />
                            Text
                          </button>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(currentDraft, draftId)}
                            className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                          >
                            <Clipboard size={14} strokeWidth={1.25} />
                            {copiedId === draftId ? "Copied!" : "Copy"}
                          </button>
                          {isEditing ? (
                            <button
                              type="button"
                              onClick={() => handleSaveDraft(draftId)}
                              className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                            >
                              <Save size={14} strokeWidth={1.25} />
                              Save
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditingDraftId(draftId)}
                              className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                            >
                              <Edit2 size={14} strokeWidth={1.25} />
                              Edit
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleGenerateDraft(prospect)}
                          disabled={generating}
                          className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text)] transition hover:border-[var(--rm-text)] disabled:opacity-60"
                        >
                          {generating ? "Generating..." : "Generate Draft"}
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
              })
            )}
          </div>
        </section>
      ))}

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
