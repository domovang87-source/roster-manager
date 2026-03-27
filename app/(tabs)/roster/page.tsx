"use client";

import React from "react";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { Clock, MessageSquare, Pencil, Trash2 } from "lucide-react";
import ProspectCard from "../../../components/ProspectCard";
import PaywallModal from "../../../components/PaywallModal";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import { useProStatus } from "../../../lib/use-pro-status";

const DEFAULT_REMIND_DAYS: Record<string, number> = { A: 7, B: 14, C: 30 };

const FREE_ROSTER_LIMIT = 1;

type Tier = "A" | "B" | "C";

type Prospect = {
  id: string;
  name: string;
  note?: string;
  tier: Tier;
  phoneNumber?: string;
};

type SimulationResponse = {
  tier: Tier;
  summary?: string;
  suggestedReply?: string;
  autoReply?: string;
};

type MessageItem = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
};

const tierOrder: Tier[] = ["A", "B", "C"];
const tierLabels: Record<Tier, string> = {
  A: "A-Tier",
  B: "B-Tier",
  C: "C-Tier",
};

const emptyTierMap: Record<Tier, Prospect[]> = {
  A: [],
  B: [],
  C: [],
};

export default function RosterPage() {
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(
    null
  );
  const [tierMap, setTierMap] = React.useState<Record<Tier, Prospect[]>>(
    emptyTierMap
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newTier, setNewTier] = React.useState<Tier>("B");
  const [newPhone, setNewPhone] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [editingProspect, setEditingProspect] = React.useState<Prospect | null>(
    null
  );
  const [editName, setEditName] = React.useState("");
  const [editTier, setEditTier] = React.useState<Tier>("B");
  const [editNote, setEditNote] = React.useState("");
  const [editPhone, setEditPhone] = React.useState("");
  const [selectedProspect, setSelectedProspect] = React.useState<Prospect | null>(
    null
  );
  const [incomingText, setIncomingText] = React.useState("");
  const [responseData, setResponseData] = React.useState<SimulationResponse | null>(
    null
  );
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [prospectMessages, setProspectMessages] = React.useState<MessageItem[]>([]);
  const [showPaywall, setShowPaywall] = React.useState(false);
  const { isPro } = useProStatus();
  const [staleDays, setStaleDays] = React.useState<Record<string, number | null>>({});

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

      setIsLoading(false);
      setError(
        `Supabase is not configured (${missingParts} missing). Add env vars to .env.local and restart the dev server.`
      );
      return;
    }

    const fetchProspects = async () => {
      setIsLoading(true);
      setError(null);

      const [prospectsResult, messagesResult, dismissedResult, rulesResult] = await Promise.all([
        client.from("prospects").select("id,name,tier,vibe_notes,phone_number"),
        client.from("messages").select("prospect_id,created_at").order("created_at", { ascending: false }).limit(5000),
        client
          .from("scheduled_replies")
          .select("prospect_id,dismissed_at")
          .eq("status", "dismissed")
          .not("dismissed_at", "is", null)
          .order("dismissed_at", { ascending: false })
          .limit(5000),
        client.from("tier_rules").select("tier,remind_after_days"),
      ]);

      if (prospectsResult.error) {
        setError("Failed to load prospects.");
        setIsLoading(false);
        return;
      }

      const remindDays: Record<string, number> = {};
      (rulesResult.data ?? []).forEach((r) => {
        if (r.tier && typeof r.remind_after_days === "number") {
          remindDays[r.tier as string] = r.remind_after_days;
        }
      });

      const lastActivity = new Map<string, string>();
      for (const msg of messagesResult.data ?? []) {
        const pid = msg.prospect_id as string;
        if (!lastActivity.has(pid)) {
          lastActivity.set(pid, msg.created_at as string);
        }
      }
      for (const row of dismissedResult.data ?? []) {
        const pid = row.prospect_id as string;
        if (!lastActivity.has(pid)) {
          lastActivity.set(pid, row.dismissed_at as string);
        }
      }

      const nextMap: Record<Tier, Prospect[]> = { A: [], B: [], C: [] };
      const staleMap: Record<string, number | null> = {};
      const now = Date.now();

      (prospectsResult.data ?? []).forEach((row) => {
        const rowTier = row.tier as Tier | undefined;
        if (!rowTier || !nextMap[rowTier]) return;
        const pid = String(row.id);

        nextMap[rowTier].push({
          id: pid,
          name: row.name ?? "Unknown",
          note: row.vibe_notes ?? undefined,
          tier: rowTier,
          phoneNumber: row.phone_number ?? undefined,
        });

        const threshold = remindDays[rowTier] ?? DEFAULT_REMIND_DAYS[rowTier] ?? 14;
        const last = lastActivity.get(pid);
        if (!last) {
          staleMap[pid] = -1;
        } else {
          const daysSince = Math.floor((now - new Date(last).getTime()) / 86_400_000);
          staleMap[pid] = daysSince >= threshold ? daysSince : null;
        }
      });

      setTierMap(nextMap);
      setStaleDays(staleMap);
      setIsLoading(false);
    };

    fetchProspects();
  }, []);

  React.useEffect(() => {
    if (!selectedProspect) {
      setProspectMessages([]);
      return;
    }
    const client = supabaseRef.current;
    if (!client) return;

    const loadMessages = async () => {
      const { data } = await client
        .from("messages")
        .select("id,direction,body,created_at")
        .eq("prospect_id", selectedProspect!.id)
        .order("created_at", { ascending: true });
      setProspectMessages(
        (data ?? []).map((r) => ({
          id: r.id as string,
          direction: r.direction as "inbound" | "outbound",
          body: (r.body as string) || "",
          created_at: r.created_at as string,
        }))
      );
    };
    loadMessages();
  }, [selectedProspect?.id]);

  const handleDragEnd = async (event: DragEndEvent) => {
    const client = supabaseRef.current;
    if (!client) return;
    const { active, over } = event;
    if (!over) return;

    const fromTier = active.data.current?.tier as Tier | undefined;
    const toTier = over.id as Tier;
    if (!fromTier || fromTier === toTier) return;

    const activeId = String(active.id);

    const previousMap = tierMap;

    setTierMap((prev) => {
      const activeProspect = prev[fromTier].find(
        (prospect) => prospect.id === activeId
      );
      if (!activeProspect) return prev;

      return {
        ...prev,
        [fromTier]: prev[fromTier].filter(
          (prospect) => prospect.id !== activeId
        ),
        [toTier]: [activeProspect, ...prev[toTier]],
      };
    });

    const { error: updateError } = await client
      .from("prospects")
      .update({ tier: toTier })
      .eq("id", activeId);

    if (updateError) {
      setTierMap(previousMap);
      setError("Failed to update tier.");
    }
  };

  const totalProspects = tierOrder.reduce(
    (sum, t) => sum + tierMap[t].length,
    0
  );

  const handleNewProspectClick = () => {
    if (!isPro && totalProspects >= FREE_ROSTER_LIMIT) {
      setShowPaywall(true);
    } else {
      setIsModalOpen(true);
    }
  };

  const handleCreateProspect = async () => {
    const client = supabaseRef.current;
    if (!client) return;
    const trimmedName = newName.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const { data, error: insertError } = await client
      .from("prospects")
      .insert({
        name: trimmedName,
        tier: newTier,
        phone_number: newPhone.trim() || null,
      })
      .select("id,name,tier,vibe_notes,phone_number")
      .single();

    if (insertError || !data) {
      console.error("Create prospect error:", insertError);
      setError(insertError?.message ?? "Failed to create prospect.");
      setIsSaving(false);
      return;
    }

    setTierMap((prev) => ({
      ...prev,
      [newTier]: [
        {
          id: String(data.id),
          name: data.name ?? trimmedName,
          note: data.vibe_notes ?? undefined,
          tier: newTier,
          phoneNumber: data.phone_number ?? undefined,
        },
        ...prev[newTier],
      ],
    }));

    setIsSaving(false);
    setIsModalOpen(false);
    setNewName("");
    setNewPhone("");
    setNewTier("B");
  };

  const handleGenerateResponse = async () => {
    const client = supabaseRef.current;
    if (!client || !selectedProspect) return;
    if (!incomingText.trim()) {
      setError("Incoming text is required.");
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/generate-response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: selectedProspect.tier,
          name: selectedProspect.name,
          vibeNotes: selectedProspect.note ?? "",
          incomingText,
        }),
      });

      const payload = (await res.json()) as SimulationResponse & {
        error?: string;
      };

      if (!res.ok || payload.error) {
        setError(payload.error ?? "Failed to generate response.");
        setIsGenerating(false);
        return;
      }

      setResponseData(payload);
    } catch {
      setError("Failed to generate response.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenEdit = (prospect: Prospect) => {
    setEditingProspect(prospect);
    setEditName(prospect.name);
    setEditTier(prospect.tier);
    setEditNote(prospect.note ?? "");
    setEditPhone(prospect.phoneNumber ?? "");
    setIsEditOpen(true);
  };

  const handleSaveEdit = async () => {
    const client = supabaseRef.current;
    if (!client || !editingProspect) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }

    setIsSaving(true);
    setError(null);

    const { error: updateError } = await client
      .from("prospects")
      .update({
        name: trimmedName,
        tier: editTier,
        vibe_notes: editNote.trim(),
        phone_number: editPhone.trim() || null,
      })
      .eq("id", editingProspect.id);

    if (updateError) {
      setError("Failed to update prospect.");
      setIsSaving(false);
      return;
    }

    setTierMap((prev) => {
      const next = { ...prev };
      (Object.keys(next) as Tier[]).forEach((tier) => {
        next[tier] = next[tier].filter((p) => p.id !== editingProspect.id);
      });

      next[editTier] = [
        {
          ...editingProspect,
          name: trimmedName,
          tier: editTier,
          note: editNote.trim() || undefined,
          phoneNumber: editPhone.trim() || undefined,
        },
        ...next[editTier],
      ];

      return next;
    });

    if (selectedProspect?.id === editingProspect.id) {
      setSelectedProspect({
        ...selectedProspect,
        name: trimmedName,
        tier: editTier,
        note: editNote.trim() || undefined,
        phoneNumber: editPhone.trim() || undefined,
      });
    }

    setIsSaving(false);
    setIsEditOpen(false);
    setEditingProspect(null);
  };

  const handleDeleteProspect = async (prospect: Prospect) => {
    const client = supabaseRef.current;
    if (!client) return;
    const confirmed = window.confirm(`Delete ${prospect.name}?`);
    if (!confirmed) return;

    setError(null);
    const { error: deleteError } = await client
      .from("prospects")
      .delete()
      .eq("id", prospect.id);

    if (deleteError) {
      setError("Failed to delete prospect.");
      return;
    }

    setTierMap((prev) => ({
      ...prev,
      [prospect.tier]: prev[prospect.tier].filter((p) => p.id !== prospect.id),
    }));

    if (selectedProspect?.id === prospect.id) {
      setSelectedProspect(null);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-wide">
            Roster Ranking
          </h1>
          <p className="text-sm text-[var(--rm-text-muted)]">
            Drag prospects across tiers to match priority.
          </p>
        </div>
        <button
          type="button"
          onClick={handleNewProspectClick}
          className="border border-[var(--rm-border)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:border-[var(--rm-text)]"
        >
          New Prospect
        </button>
      </header>

      {error ? (
        <div className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 text-sm text-[var(--rm-text-muted)]">
          {error}
        </div>
      ) : null}

      <DndContext onDragEnd={handleDragEnd}>
        <div className="grid gap-4 lg:grid-cols-3">
          {tierOrder.map((tier) => (
            <TierColumn
              key={tier}
              tier={tier}
              label={tierLabels[tier]}
              isPriority={tier === "A"}
            >
              {isLoading ? (
                <div className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                  Loading...
                </div>
              ) : null}
              {tierMap[tier].map((prospect) => (
                <DraggableProspect
                  key={prospect.id}
                  tier={tier}
                  prospect={prospect}
                  isSelected={selectedProspect?.id === prospect.id}
                  staleDayCount={staleDays[prospect.id] ?? null}
                  onSelect={() => {
                    setSelectedProspect(prospect);
                    setResponseData(null);
                  }}
                  onEdit={() => handleOpenEdit(prospect)}
                />
              ))}
            </TierColumn>
          ))}
        </div>
      </DndContext>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-md border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">
                New Prospect
              </h2>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-2 text-sm">
                Name
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Enter name"
                  className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                Phone
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(event) => setNewPhone(event.target.value)}
                  placeholder="+1 555 123 4567"
                  className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                Starting tier
                <select
                  value={newTier}
                  onChange={(event) => setNewTier(event.target.value as Tier)}
                  className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                >
                  {tierOrder.map((tier) => (
                    <option key={tier} value={tier}>
                      {tierLabels[tier]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="border border-[var(--rm-border)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateProspect}
                disabled={isSaving}
                className="border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isEditOpen && editingProspect ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <div className="w-full max-w-md border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-[0.3em]">
                Edit Prospect
              </h2>
              <button
                type="button"
                onClick={() => setIsEditOpen(false)}
                className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
              >
                Close
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-2 text-sm">
                Name
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                Tier
                <select
                  value={editTier}
                  onChange={(event) => setEditTier(event.target.value as Tier)}
                  className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                >
                  {tierOrder.map((tier) => (
                    <option key={tier} value={tier}>
                      {tierLabels[tier]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-2 text-sm">
                Phone
                <input
                  type="tel"
                  value={editPhone}
                  onChange={(event) => setEditPhone(event.target.value)}
                  placeholder="+1 555 123 4567"
                  className="h-10 border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                Vibe Notes
                <textarea
                  value={editNote}
                  onChange={(event) => setEditNote(event.target.value)}
                  rows={4}
                  className="border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 py-2 text-sm text-[var(--rm-text)]"
                />
              </label>
            </div>

            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleDeleteProspect(editingProspect)}
                className="flex items-center gap-1 border border-[var(--rm-border)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
              >
                <Trash2 size={12} strokeWidth={1.25} />
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditOpen(false)}
                  className="border border-[var(--rm-border)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSaving}
                  className="border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedProspect ? (
        <div className="fixed inset-y-0 right-0 z-40 w-full max-w-md border-l border-[var(--rm-border)] bg-[var(--rm-bg)]/95 backdrop-blur">
          <div className="flex h-full flex-col p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--rm-text-muted)]">
                  Conversation Simulator
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-wide">
                  {selectedProspect.name}
                </h2>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                  {tierLabels[selectedProspect.tier]}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {selectedProspect.phoneNumber ? (
                  <a
                    href={`sms:${selectedProspect.phoneNumber}`}
                    className="flex items-center gap-2 border border-[var(--rm-border)] px-3 py-1 text-xs uppercase tracking-[0.3em] text-[var(--rm-text)]"
                  >
                    <MessageSquare size={14} strokeWidth={1.25} />
                    Text
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedProspect(null)}
                  className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-1 flex-col gap-4 overflow-y-auto text-sm">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                  Vibe Notes
                </p>
                <p className="text-sm text-[var(--rm-text)]">
                  {selectedProspect.note || "No notes yet."}
                </p>
              </div>

              {prospectMessages.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                    Message History
                  </p>
                  <div className="max-h-48 space-y-2 overflow-y-auto border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-3">
                    {prospectMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`text-xs ${
                          msg.direction === "inbound"
                            ? "text-[var(--rm-text-muted)]"
                            : "text-[var(--rm-text)]"
                        }`}
                      >
                        <span className="text-[10px] uppercase tracking-[0.2em]">
                          {msg.direction}
                        </span>
                        <span className="ml-2">
                          {new Date(msg.created_at).toLocaleString()}
                        </span>
                        <p className="mt-1">{msg.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <label className="flex flex-col gap-2 text-sm">
                Incoming Text (simulate)
                <textarea
                  value={incomingText}
                  onChange={(event) => setIncomingText(event.target.value)}
                  rows={6}
                  placeholder="Paste the incoming message..."
                  className="border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-3 text-sm text-[var(--rm-text)]"
                />
              </label>

              <button
                type="button"
                onClick={handleGenerateResponse}
                disabled={isGenerating}
                className="border border-[var(--rm-text)] px-4 py-2 text-xs uppercase tracking-[0.3em] transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? "Generating..." : "Generate Response"}
              </button>

              {responseData ? (
                <div className="space-y-3 border-t border-[var(--rm-border)] pt-4">
                  {selectedProspect.tier === "A" ? (
                    <>
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                          Summary
                        </p>
                        <p className="mt-2 text-sm">{responseData.summary}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                          Suggested Reply
                        </p>
                        <p className="mt-2 text-sm">{responseData.suggestedReply}</p>
                      </div>
                    </>
                  ) : (
                    <div>
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--rm-text-muted)]">
                        Auto-Reply
                      </p>
                      <p className="mt-2 text-sm">{responseData.autoReply}</p>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="Adding more than 1 roster member"
      />
    </div>
  );
}

function TierColumn({
  tier,
  label,
  isPriority,
  children,
}: {
  tier: Tier;
  label: string;
  isPriority: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[320px] border bg-[var(--rm-bg-elevated)] p-3 ${
        isPriority
          ? "border-[#d2b36a] shadow-[0_0_20px_rgba(210,179,106,0.15)]"
          : "border-[var(--rm-border)]"
      } ${isOver ? "ring-1 ring-[var(--rm-text)]" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold tracking-[0.3em]">{label}</span>
        <span className="text-[10px] uppercase text-[var(--rm-text-muted)]">
          {tier}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </div>
  );
}

function DraggableProspect({
  tier,
  prospect,
  isSelected,
  staleDayCount,
  onSelect,
  onEdit,
}: {
  tier: Tier;
  prospect: Prospect;
  isSelected: boolean;
  staleDayCount: number | null;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: prospect.id,
      data: { tier },
    });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const staleLabel =
    staleDayCount === -1
      ? "No activity"
      : staleDayCount !== null
        ? `${staleDayCount}d quiet`
        : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
      className={`${isDragging ? "opacity-60" : ""} ${
        isSelected ? "ring-1 ring-[var(--rm-text)]" : ""
      }`}
      {...listeners}
      {...attributes}
    >
      <ProspectCard
        name={prospect.name}
        note={prospect.note}
        badge={
          staleLabel ? (
            <span className="flex items-center gap-1 text-[10px] text-amber-400/80">
              <Clock size={10} strokeWidth={1.5} />
              {staleLabel}
            </span>
          ) : null
        }
        actions={
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onEdit();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="flex items-center border border-[var(--rm-border)] px-2 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--rm-text-muted)]"
              aria-label="Edit prospect"
            >
              <Pencil size={12} strokeWidth={1.25} />
            </button>
          </>
        }
      />
    </div>
  );
}
