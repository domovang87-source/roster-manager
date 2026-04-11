"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Share,
  ThumbsUp,
  X,
} from "lucide-react";
import type { MomentumContext } from "../../lib/momentum-insight";
import { momentumTeaser } from "../../lib/momentum-insight";
import { tacticalNoteFromContext } from "../../lib/pulse-tactical-audit";
import type { Tier } from "../../lib/roster-portfolio-compute";

const ELITE_TONES = [
  { id: "balanced", label: "Balanced" },
  { id: "playful", label: "Playful" },
  { id: "dominant", label: "Dominant" },
  { id: "warm", label: "Warm" },
  { id: "minimal", label: "Minimal" },
] as const;

export type EliteToneId = (typeof ELITE_TONES)[number]["id"];

export type DraftCardProspect = {
  id: string;
  name: string;
  tier: Tier;
  phoneNumber?: string;
  vibeNotes?: string;
  lastInboundBody?: string;
  lastOutboundTextBody?: string;
  lastActivityAt?: string;
  draftId?: string;
  draftText?: string;
  momentum?: number;
  momentumContext?: MomentumContext;
};

type Props = {
  prospect: DraftCardProspect;
  currentDraft: string;
  isGenerating: boolean;
  isDismissing: boolean;
  isPro: boolean;
  isElite: boolean;
  regenUsed: number;
  regenLimit: number;
  draftsEverGenerated: number;
  freeDraftLimit: number;
  quickTouching: boolean;
  toneId: EliteToneId;
  onScoreTap: () => void;
  onGenerate: (regenerate?: boolean) => void;
  onDismiss: () => void;
  onTouchedBase: () => void;
  onShare: () => void;
  onSetTone: (tone: EliteToneId) => void;
};

function clipCtx(s: string) {
  return s.length > 80 ? `${s.slice(0, 80)}…` : s;
}

function formatRelativeTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 0) return d.toLocaleDateString([], { month: "short", day: "numeric" });
  const min = Math.floor(diffMs / 60_000);
  const hrs = Math.floor(diffMs / 3_600_000);
  const days = Math.floor(diffMs / 86_400_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const TIER_DOT: Record<Tier, string> = {
  A: "bg-amber-400",
  B: "bg-sky-400",
  C: "bg-slate-400",
};

export default function DraftCard({
  prospect,
  currentDraft,
  isGenerating,
  isDismissing,
  isPro,
  isElite,
  regenUsed,
  regenLimit,
  draftsEverGenerated,
  freeDraftLimit,
  quickTouching,
  toneId,
  onScoreTap,
  onGenerate,
  onDismiss,
  onTouchedBase,
  onShare,
  onSetTone,
}: Props) {
  const router = useRouter();
  const draftId = prospect.draftId;
  const regenBlocked =
    (!isPro && Boolean(draftId)) ||
    (isPro && !isElite && Boolean(draftId) && regenUsed >= regenLimit);
  const youTextedLast = prospect.momentumContext?.latestDirection === "outbound";
  const hasQuoteYou = youTextedLast && Boolean(prospect.lastOutboundTextBody?.trim());
  const hasQuoteThem = !youTextedLast && Boolean(prospect.lastInboundBody?.trim());
  const tacticalAudit = tacticalNoteFromContext(
    prospect.tier,
    prospect.momentumContext,
    prospect.momentum,
    prospect.name
  );

  const contextLine = hasQuoteYou
    ? `You: "${clipCtx(prospect.lastOutboundTextBody!)}"`
    : youTextedLast
      ? "You texted last"
      : hasQuoteThem
        ? `"${clipCtx(prospect.lastInboundBody!)}"`
        : null;

  return (
    <article
      className={`rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg)] p-4 transition-opacity duration-300 ${
        isDismissing ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
          onClick={() => router.push(`/inbox?prospect=${encodeURIComponent(prospect.id)}`)}
        >
          <span className={`h-2 w-2 shrink-0 rounded-full ${TIER_DOT[prospect.tier]}`} />
          <p className="min-w-0 truncate text-sm font-semibold">{prospect.name}</p>
          {prospect.lastActivityAt && (
            <span className="shrink-0 text-xs text-[var(--rm-text-muted)]">
              {formatRelativeTime(prospect.lastActivityAt)}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Score pill */}
          <button
            type="button"
            onClick={onScoreTap}
            className="flex items-center gap-1 rounded-full border border-[var(--rm-border)] px-2 py-0.5 text-xs tabular-nums text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)]"
          >
            <span className="font-semibold text-[var(--rm-text)]">{prospect.momentum ?? 0}</span>
            <span className="hidden text-[11px] sm:inline">
              {momentumTeaser(prospect.name, prospect.momentum ?? 0, prospect.momentumContext).split("·")[0]?.trim()}
            </span>
          </button>

          {/* Dismiss */}
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1.5 text-[var(--rm-text-muted)] transition hover:bg-[var(--rm-bg-elevated)] hover:text-[var(--rm-text)]"
            aria-label="Hide card"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Tactical audit */}
      {tacticalAudit && (
        <p className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs leading-snug text-amber-100/90">
          {tacticalAudit}
        </p>
      )}

      {/* Context line */}
      {contextLine && (
        <p className="mt-2 text-sm text-[var(--rm-text-muted)]">{contextLine}</p>
      )}

      {/* Elite tone picker */}
      {isElite && (
        <div className="mt-2 flex flex-wrap gap-1">
          {ELITE_TONES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onSetTone(t.id)}
              className={`rounded-full px-2 py-0.5 text-[11px] transition ${
                toneId === t.id
                  ? "border border-[var(--rm-accent)]/50 bg-[var(--rm-accent)]/10 text-[var(--rm-text)]"
                  : "text-[var(--rm-text-muted)] hover:text-[var(--rm-text)]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Draft body or generate */}
      {draftId && currentDraft ? (
        <div className="mt-3">
          {isGenerating && (
            <p className="mb-2 flex items-center gap-2 text-xs text-[var(--rm-text-muted)]">
              <Loader2 size={12} className="animate-spin" /> Regenerating…
            </p>
          )}
          <p className="text-sm leading-relaxed text-[var(--rm-text)]">{currentDraft}</p>

          {/* Action row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onGenerate(true)}
              disabled={isGenerating || regenBlocked}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rm-border)] px-3 py-1.5 text-xs text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)] hover:text-[var(--rm-text)] disabled:opacity-30"
            >
              <RefreshCw size={13} strokeWidth={1.5} className={isGenerating ? "animate-spin" : ""} />
              Redo
            </button>
            <button
              type="button"
              onClick={() => {
                const body = encodeURIComponent(currentDraft);
                window.location.href = prospect.phoneNumber
                  ? `sms:${prospect.phoneNumber}?body=${body}`
                  : `sms:?body=${body}`;
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rm-border)] px-3 py-1.5 text-xs text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)] hover:text-[var(--rm-text)]"
            >
              <MessageSquare size={13} strokeWidth={1.25} />
              Send
            </button>
            <button
              type="button"
              onClick={onShare}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rm-border)] px-3 py-1.5 text-xs text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)] hover:text-[var(--rm-text)]"
            >
              <Share size={13} strokeWidth={1.25} />
              Copy
            </button>
            <button
              type="button"
              onClick={onTouchedBase}
              disabled={quickTouching}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rm-border)] px-3 py-1.5 text-xs text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)] hover:text-[var(--rm-text)] disabled:opacity-30"
            >
              {quickTouching ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ThumbsUp size={13} strokeWidth={1.25} />
              )}
              Done
            </button>
            {isPro && !isElite && draftId && (
              <span className="text-[11px] text-[var(--rm-text-muted)]">
                {regenUsed}/{regenLimit}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isGenerating && (
            <p className="flex items-center gap-2 text-xs text-[var(--rm-text-muted)]">
              <Loader2 size={12} className="animate-spin" /> Generating…
            </p>
          )}
          {!isGenerating && (
            <>
              {!isPro && draftsEverGenerated >= freeDraftLimit ? (
                <button
                  type="button"
                  onClick={() => onGenerate()}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--rm-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
                >
                  <Lock size={12} strokeWidth={1.5} />
                  Generate (Pro)
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onGenerate()}
                  className="inline-flex items-center rounded-full bg-[var(--rm-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110"
                >
                  Generate
                </button>
              )}
              <button
                type="button"
                onClick={onTouchedBase}
                disabled={quickTouching}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rm-border)] px-3 py-1.5 text-xs text-[var(--rm-text-muted)] transition hover:border-[var(--rm-text-muted)] hover:text-[var(--rm-text)] disabled:opacity-30"
              >
                {quickTouching ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <ThumbsUp size={13} strokeWidth={1.25} />
                )}
                Touched base
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
