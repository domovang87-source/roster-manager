"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { DndContext, DragEndEvent, useDraggable, useDroppable } from "@dnd-kit/core";
import { Clock, MessageSquare, Pencil, Trash2, Users } from "lucide-react";
import ProspectCard from "../../../components/ProspectCard";
import PaywallModal from "../../../components/PaywallModal";
import Sheet from "@/components/ui/Sheet";
import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { FREE_ROSTER_SLOTS, rosterRequiresUpgradeForUi } from "../../../lib/free-tier";
import { getSupabaseClient, getSupabaseConfig } from "../../../lib/supabase/client";
import { useProStatus } from "../../../lib/use-pro-status";
import { useSession } from "../../../lib/use-session";

const DEFAULT_REMIND_DAYS: Record<string, number> = { A: 7, B: 14, C: 30 };

type Tier = "A" | "B" | "C";

type Prospect = {
  id: string;
  name: string;
  note?: string;
  tier: Tier;
  phoneNumber?: string;
};

type MessageItem = {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  created_at: string;
};

const tierOrder: Tier[] = ["A", "B", "C"];
const tierLabels: Record<Tier, string> = {
  A: "A-Tier · inner circle",
  B: "B-Tier · in the mix",
  C: "C-Tier · check-ins",
};

const emptyTierMap: Record<Tier, Prospect[]> = {
  A: [],
  B: [],
  C: [],
};

type FormMode = "add" | "edit";

function RosterPageInner() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [flashTier, setFlashTier] = React.useState<Tier | null>(null);
  const supabaseRef = React.useRef<ReturnType<typeof getSupabaseClient> | null>(
    null
  );
  const [tierMap, setTierMap] = React.useState<Record<Tier, Prospect[]>>(
    emptyTierMap
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Unified form sheet state
  const [formOpen, setFormOpen] = React.useState(false);
  const [formMode, setFormMode] = React.useState<FormMode>("add");
  const [formName, setFormName] = React.useState("");
  const [formTier, setFormTier] = React.useState<Tier>("B");
  const [formPhone, setFormPhone] = React.useState("");
  const [formNote, setFormNote] = React.useState("");
  const [formProspect, setFormProspect] = React.useState<Prospect | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const [deleteConfirmStep, setDeleteConfirmStep] = React.useState(false);
  const [deletePhrase, setDeletePhrase] = React.useState("");

  // Detail sheet state
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [selectedProspect, setSelectedProspect] = React.useState<Prospect | null>(null);
  const [prospectMessages, setProspectMessages] = React.useState<MessageItem[]>([]);

  const [showPaywall, setShowPaywall] = React.useState(false);
  const [paywallFeature, setPaywallFeature] = React.useState<string | undefined>(
    undefined
  );
  const { isPro, checked: subscriptionChecked } = useProStatus();
  const { userId } = useSession();
  const [staleDays, setStaleDays] = React.useState<Record<string, number | null>>({});

  React.useEffect(() => {
    const t = searchParams.get("tier");
    if (t !== "A" && t !== "B" && t !== "C") {
      setFlashTier(null);
      return;
    }
    const tier = t as Tier;
    setFlashTier(tier);
    const scrollId = window.setTimeout(() => {
      document.getElementById(`roster-tier-${tier}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 80);
    const clearId = window.setTimeout(() => setFlashTier(null), 2800);
    return () => {
      window.clearTimeout(scrollId);
      window.clearTimeout(clearId);
    };
  }, [searchParams]);

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

    if (!subscriptionChecked) {
      setIsLoading(true);
      return;
    }

    if (!userId) {
      setIsLoading(true);
      return;
    }

    const fetchProspects = async () => {
      setIsLoading(true);
      setError(null);

      const [prospectsResult, messagesResult, dismissedResult, rulesResult] = await Promise.all([
        client.from("prospects").select("id,name,tier,vibe_notes,phone_number,user_id"),
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
        const rowUid = row.user_id as string | null | undefined;
        if (rowUid == null || String(rowUid) !== userId) return;
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
  }, [userId, subscriptionChecked]);

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
      toast("Failed to update tier", "error");
    }
  };

  const totalProspects = tierOrder.reduce(
    (sum, t) => sum + tierMap[t].length,
    0
  );

  const freeTierRosterFull = rosterRequiresUpgradeForUi(
    totalProspects,
    subscriptionChecked,
    isPro
  );

  /* ── Form helpers ── */

  const openAddForm = () => {
    if (!subscriptionChecked) return;
    if (isLoading) return;
    if (freeTierRosterFull) {
      setPaywallFeature("Unlimited roster");
      setShowPaywall(true);
    } else {
      setFormMode("add");
      setFormProspect(null);
      setFormName("");
      setFormTier("B");
      setFormPhone("");
      setFormNote("");
      setDeleteConfirmStep(false);
      setDeletePhrase("");
      setFormOpen(true);
    }
  };

  const openEditForm = (prospect: Prospect) => {
    setFormMode("edit");
    setFormProspect(prospect);
    setFormName(prospect.name);
    setFormTier(prospect.tier);
    setFormPhone(prospect.phoneNumber ?? "");
    setFormNote(prospect.note ?? "");
    setDeleteConfirmStep(false);
    setDeletePhrase("");
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormProspect(null);
    setDeleteConfirmStep(false);
    setDeletePhrase("");
  };

  const handleCreateProspect = async () => {
    const client = supabaseRef.current;
    if (!client) return;
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast("Name is required", "error");
      return;
    }
    if (!subscriptionChecked) return;
    if (!isPro && totalProspects >= FREE_ROSTER_SLOTS) {
      setPaywallFeature("Unlimited roster");
      setShowPaywall(true);
      closeForm();
      return;
    }

    setIsSaving(true);
    setError(null);

    const res = await fetch("/api/prospects", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: trimmedName,
        tier: formTier,
        phone_number: formPhone.trim() || null,
      }),
    });
    const payload = (await res.json()) as {
      data?: {
        id: string;
        name: string | null;
        tier: string | null;
        vibe_notes: string | null;
        phone_number: string | null;
      };
      error?: string;
      code?: string;
    };

    if (res.status === 403 && payload.code === "ROSTER_LIMIT") {
      setPaywallFeature("Unlimited roster");
      setShowPaywall(true);
      closeForm();
      setIsSaving(false);
      return;
    }

    if (!res.ok || !payload.data) {
      console.error("Create prospect error:", payload.error, res.status);
      toast(payload.error ?? "Failed to create prospect", "error");
      setIsSaving(false);
      return;
    }

    const data = payload.data;

    setTierMap((prev) => ({
      ...prev,
      [formTier]: [
        {
          id: String(data.id),
          name: data.name ?? trimmedName,
          note: data.vibe_notes ?? undefined,
          tier: formTier,
          phoneNumber: data.phone_number ?? undefined,
        },
        ...prev[formTier],
      ],
    }));

    toast(`${trimmedName} added to ${formTier}-tier`, "success");
    setIsSaving(false);
    closeForm();
  };

  const handleSaveEdit = async () => {
    const client = supabaseRef.current;
    if (!client || !formProspect) return;
    const trimmedName = formName.trim();
    if (!trimmedName) {
      toast("Name is required", "error");
      return;
    }

    setIsSaving(true);
    setError(null);

    const { error: updateError } = await client
      .from("prospects")
      .update({
        name: trimmedName,
        tier: formTier,
        vibe_notes: formNote.trim(),
        phone_number: formPhone.trim() || null,
      })
      .eq("id", formProspect.id);

    if (updateError) {
      toast("Failed to update prospect", "error");
      setIsSaving(false);
      return;
    }

    setTierMap((prev) => {
      const next = { ...prev };
      (Object.keys(next) as Tier[]).forEach((tier) => {
        next[tier] = next[tier].filter((p) => p.id !== formProspect.id);
      });

      next[formTier] = [
        {
          ...formProspect,
          name: trimmedName,
          tier: formTier,
          note: formNote.trim() || undefined,
          phoneNumber: formPhone.trim() || undefined,
        },
        ...next[formTier],
      ];

      return next;
    });

    if (selectedProspect?.id === formProspect.id) {
      setSelectedProspect({
        ...selectedProspect,
        name: trimmedName,
        tier: formTier,
        note: formNote.trim() || undefined,
        phoneNumber: formPhone.trim() || undefined,
      });
    }

    toast("Changes saved", "success");
    setIsSaving(false);
    closeForm();
  };

  const handleDeleteProspect = async () => {
    const prospect = formProspect;
    const client = supabaseRef.current;
    if (!client || !prospect) return;
    if (deletePhrase.trim().toLowerCase() !== "delete") {
      toast('Type the word "delete" to confirm removal', "error");
      return;
    }

    setError(null);
    const { error: deleteError } = await client
      .from("prospects")
      .delete()
      .eq("id", prospect.id);

    if (deleteError) {
      toast("Failed to delete prospect", "error");
      return;
    }

    setTierMap((prev) => ({
      ...prev,
      [prospect.tier]: prev[prospect.tier].filter((p) => p.id !== prospect.id),
    }));

    if (selectedProspect?.id === prospect.id) {
      setSelectedProspect(null);
      setDetailOpen(false);
    }

    toast(`${prospect.name} removed`, "neutral");
    closeForm();
  };

  const handleFormSubmit = () => {
    if (formMode === "add") {
      void handleCreateProspect();
    } else {
      void handleSaveEdit();
    }
  };

  /* ── Detail sheet helpers ── */

  const openDetail = (prospect: Prospect) => {
    setSelectedProspect(prospect);
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedProspect(null);
  };

  const messageCount = prospectMessages.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="People you're texting"
        subtitle="Drag cards between A, B, and C. A = most important, C = casual."
        eyebrow={
          !isPro
            ? "Free: 1 person · 1 AI draft · Pulse metrics · upgrade for unlimited"
            : undefined
        }
        action={
          <button
            type="button"
            onClick={openAddForm}
            disabled={isLoading}
            className={`rounded-lg border px-4 py-2 text-[11px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              freeTierRosterFull
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200/95 hover:border-emerald-400/70"
                : "border-[var(--rm-border)] text-[var(--rm-text)] hover:border-[var(--rm-text)]"
            }`}
          >
            {freeTierRosterFull ? "Upgrade · more roster" : "Add person"}
          </button>
        }
      />

      {error && (
        <div className="rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 text-sm text-[var(--rm-text-muted)]">
          {error}
        </div>
      )}

      <DndContext onDragEnd={handleDragEnd}>
        <div className="flex flex-col gap-4">
          {tierOrder.map((tier) => (
            <TierColumn
              key={tier}
              tier={tier}
              label={tierLabels[tier]}
              isPriority={tier === "A"}
              highlight={flashTier === tier}
            >
              {isLoading ? (
                <p className="label text-[var(--rm-text-muted)]">Loading…</p>
              ) : tierMap[tier].length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--rm-text-muted)]">
                  No one here yet
                </p>
              ) : (
                tierMap[tier].map((prospect) => (
                  <DraggableProspect
                    key={prospect.id}
                    tier={tier}
                    prospect={prospect}
                    isSelected={selectedProspect?.id === prospect.id}
                    staleDayCount={staleDays[prospect.id] ?? null}
                    onSelect={() => openDetail(prospect)}
                    onEdit={() => openEditForm(prospect)}
                  />
                ))
              )}
            </TierColumn>
          ))}
        </div>
      </DndContext>

      {/* Empty state when no prospects at all */}
      {!isLoading && totalProspects === 0 && !error && (
        <EmptyState
          icon={Users}
          headline="Your roster is empty"
          body="Add someone to start tracking your conversations and texting cadence."
        />
      )}

      {/* ── Unified add / edit Sheet ── */}
      <Sheet
        open={formOpen}
        onClose={closeForm}
        title={formMode === "add" ? "New person" : "Edit person"}
      >
        <div className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="label text-[var(--rm-text-muted)]">Name</span>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Enter name"
              className="h-10 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label text-[var(--rm-text-muted)]">Phone</span>
            <input
              type="tel"
              value={formPhone}
              onChange={(e) => setFormPhone(e.target.value)}
              placeholder="+1 555 123 4567"
              className="h-10 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="label text-[var(--rm-text-muted)]">
              {formMode === "add" ? "Starting tier" : "Tier"}
            </span>
            <select
              value={formTier}
              onChange={(e) => setFormTier(e.target.value as Tier)}
              className="h-10 rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)]"
            >
              {tierOrder.map((tier) => (
                <option key={tier} value={tier}>
                  {tierLabels[tier]}
                </option>
              ))}
            </select>
          </label>

          {formMode === "edit" && (
            <label className="flex flex-col gap-1.5">
              <span className="label text-[var(--rm-text-muted)]">
                Vibe notes (context for AI + audit)
              </span>
              <textarea
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                rows={4}
                className="rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg)] px-3 py-2 text-sm text-[var(--rm-text)]"
              />
            </label>
          )}
        </div>

        {/* Delete confirmation (edit mode only) */}
        {formMode === "edit" && deleteConfirmStep && formProspect && (
          <div className="mt-5 space-y-3 rounded-lg border border-rose-900/40 bg-rose-950/20 p-4">
            <p className="text-xs leading-relaxed text-rose-200/90">
              This permanently removes{" "}
              <span className="font-medium text-rose-100">{formProspect.name}</span>{" "}
              from your roster. Their messages and AI drafts are deleted with them.
              This cannot be undone.
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="label text-rose-200/65">Type delete to confirm</span>
              <input
                type="text"
                value={deletePhrase}
                onChange={(e) => setDeletePhrase(e.target.value)}
                placeholder="delete"
                autoComplete="off"
                className="h-10 rounded-lg border border-rose-900/50 bg-[var(--rm-bg)] px-3 text-sm text-[var(--rm-text)] placeholder:text-[var(--rm-text-muted)]/40"
              />
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmStep(false);
                  setDeletePhrase("");
                }}
                className="min-h-[42px] w-full rounded-lg border border-[var(--rm-border)] px-4 py-2.5 text-[11px] font-medium text-[var(--rm-text-muted)] sm:w-auto"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteProspect()}
                disabled={deletePhrase.trim().toLowerCase() !== "delete"}
                className="min-h-[42px] w-full rounded-lg border border-rose-700/60 bg-rose-950/40 px-4 py-2.5 text-[11px] font-medium text-rose-200 transition hover:border-rose-600 hover:bg-rose-950/55 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Permanently delete
              </button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div
          className={`mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 ${
            formMode === "edit" && !deleteConfirmStep
              ? "sm:justify-between"
              : "sm:justify-end"
          }`}
        >
          {formMode === "edit" && !deleteConfirmStep && (
            <button
              type="button"
              onClick={() => setDeleteConfirmStep(true)}
              className="flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--rm-border)] px-4 py-2.5 text-[11px] font-medium text-[var(--rm-text-muted)] sm:w-auto sm:justify-start"
            >
              <Trash2 size={12} strokeWidth={1.25} />
              Delete
            </button>
          )}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end sm:gap-2">
            <button
              type="button"
              onClick={closeForm}
              className="min-h-[42px] w-full rounded-lg border border-[var(--rm-border)] px-4 py-2.5 text-[11px] font-medium text-[var(--rm-text-muted)] sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFormSubmit}
              disabled={isSaving}
              className="min-h-[42px] w-full rounded-lg border border-[var(--rm-text)] px-4 py-2.5 text-[11px] font-medium transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Sheet>

      {/* ── Person detail Sheet ── */}
      <Sheet
        open={detailOpen}
        onClose={closeDetail}
        title={selectedProspect?.name}
      >
        {selectedProspect && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="label rounded-md bg-[var(--rm-bg)] px-2 py-0.5 text-[var(--rm-text-muted)]">
                {tierLabels[selectedProspect.tier]}
              </span>
              {selectedProspect.phoneNumber && (
                <a
                  href={`sms:${selectedProspect.phoneNumber}`}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rm-border)] px-2.5 py-1 text-[11px] font-medium text-[var(--rm-text)]"
                >
                  <MessageSquare size={12} strokeWidth={1.25} />
                  Text
                </a>
              )}
            </div>

            <div className="space-y-1">
              <p className="label text-[var(--rm-text-muted)]">Vibe notes</p>
              <p className="text-sm text-[var(--rm-text)]">
                {selectedProspect.note || "No notes yet."}
              </p>
            </div>

            <div className="space-y-1">
              <p className="label text-[var(--rm-text-muted)]">Messages</p>
              <p className="text-sm text-[var(--rm-text)]">
                {messageCount === 0
                  ? "No messages logged"
                  : `${messageCount} message${messageCount !== 1 ? "s" : ""} logged`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                closeDetail();
                openEditForm(selectedProspect);
              }}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--rm-text)] px-4 py-2.5 text-[11px] font-medium transition hover:bg-[var(--rm-text)] hover:text-[var(--rm-bg)]"
            >
              <Pencil size={12} strokeWidth={1.25} />
              Edit
            </button>
          </div>
        )}
      </Sheet>

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => {
          setShowPaywall(false);
          setPaywallFeature(undefined);
        }}
        feature={paywallFeature}
      />
    </div>
  );
}

export default function RosterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[240px] items-center justify-center text-sm text-[var(--rm-text-muted)]">
          Loading roster…
        </div>
      }
    >
      <RosterPageInner />
    </Suspense>
  );
}

function TierColumn({
  tier,
  label,
  isPriority,
  highlight,
  children,
}: {
  tier: Tier;
  label: string;
  isPriority: boolean;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier });

  return (
    <div
      id={`roster-tier-${tier}`}
      ref={setNodeRef}
      className={`min-h-[180px] rounded-lg border bg-[var(--rm-bg-elevated)] p-4 transition-[box-shadow] duration-300 ${
        isPriority
          ? "border-[#d2b36a] shadow-[0_0_20px_rgba(210,179,106,0.15)]"
          : "border-[var(--rm-border)]"
      } ${isOver ? "ring-1 ring-[var(--rm-text)]" : ""} ${
        highlight ? "ring-2 ring-amber-400/70 ring-offset-2 ring-offset-[var(--rm-bg)]" : ""
      }`}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className={`label ${tier === "A" ? "text-amber-400/95" : "text-[var(--rm-text)]"}`}>
          {label}
        </span>
        <span className="label text-[var(--rm-text-muted)]">{tier}</span>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
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
      className={`cursor-pointer rounded-lg ${isDragging ? "opacity-60" : ""} ${
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
            <span className="flex items-center gap-1 text-[11px] text-amber-400/80">
              <Clock size={10} strokeWidth={1.5} />
              {staleLabel}
            </span>
          ) : null
        }
        actions={
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            onPointerDown={(event) => event.stopPropagation()}
            className="flex items-center rounded border border-[var(--rm-border)] px-2 py-1 text-[11px] text-[var(--rm-text-muted)]"
            aria-label="Edit prospect"
          >
            <Pencil size={12} strokeWidth={1.25} />
          </button>
        }
      />
    </div>
  );
}
