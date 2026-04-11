"use client";

import React from "react";
import Link from "next/link";
import { Copy, Check, ExternalLink, Loader2, Mic, MicOff, RotateCcw, Sparkles } from "lucide-react";
import { askDomoChatUrl } from "@/lib/coach-links";
import type { AskDomoHistoryEntry, AskDomoStructured } from "@/lib/ask-domo-kernel";
import { useProStatus } from "@/lib/use-pro-status";

type SpeechRecCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function getSpeechRecognition(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type Props = {
  onRequestPro?: () => void;
};

function CoachingTurn({
  coaching,
  turnIndex,
  copiedIndex,
  onCopy,
}: {
  coaching: AskDomoStructured;
  turnIndex: number;
  copiedIndex: number | null;
  onCopy: (idx: number, text: string) => void;
}) {
  return (
    <div className="space-y-4 border-t border-[color:var(--rm-border)]/60 pt-5 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/70">Turn {turnIndex + 1}</p>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">Diagnosis</p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--rm-text)]">{coaching.diagnosis}</p>
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/90">Move</p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--rm-text-muted)]">{coaching.move}</p>
      </div>
      <div className="rounded-md border border-violet-500/35 bg-violet-950/20 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-200/90">Text</p>
          <button
            type="button"
            onClick={() => onCopy(turnIndex, coaching.text)}
            className="inline-flex items-center gap-1 rounded border border-violet-500/40 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-violet-100 transition hover:bg-violet-500/15"
          >
            {copiedIndex === turnIndex ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
            {copiedIndex === turnIndex ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-[var(--rm-text)]">{coaching.text}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-[color:var(--rm-border)] bg-[var(--rm-bg)]/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400/85">If they go warm</p>
          <p className="mt-1 text-xs leading-snug text-[var(--rm-text-muted)]">{coaching.ifTheyReplyWarm}</p>
        </div>
        <div className="rounded-md border border-[color:var(--rm-border)] bg-[var(--rm-bg)]/80 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400/85">If they go cold</p>
          <p className="mt-1 text-xs leading-snug text-[var(--rm-text-muted)]">{coaching.ifTheyReplyCold}</p>
        </div>
      </div>
    </div>
  );
}

/**
 * Ask Domo–style coaching in-app for Stack Pro. Supports follow-up turns in-thread.
 */
export default function AskDomoBridge({ onRequestPro }: Props) {
  const { isPro, checked } = useProStatus();
  const inputId = React.useId();
  const followUpId = React.useId();
  const [text, setText] = React.useState("");
  const [followUp, setFollowUp] = React.useState("");
  const [listening, setListening] = React.useState(false);
  const [voiceError, setVoiceError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [apiError, setApiError] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<AskDomoHistoryEntry[]>([]);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const recRef = React.useRef<InstanceType<SpeechRecCtor> | null>(null);

  const voiceSupported = React.useMemo(() => getSpeechRecognition() !== null, []);
  const threadActive = history.length > 0;
  const canRunFirst = checked && isPro && text.trim().length >= 12 && !threadActive;
  const lastIsAssistant =
    history.length === 0 ? false : history[history.length - 1].role === "assistant";
  const canFollowUp =
    checked && isPro && lastIsAssistant && followUp.trim().length >= 3 && !loading;

  React.useEffect(() => {
    return () => {
      try {
        recRef.current?.abort();
      } catch {
        /* ignore */
      }
    };
  }, []);

  const resetThread = () => {
    setHistory([]);
    setFollowUp("");
    setApiError(null);
    setCopiedIndex(null);
  };

  const stopListening = React.useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* ignore */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const startListening = React.useCallback(() => {
    setVoiceError(null);
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setVoiceError("Voice isn’t supported in this browser — type instead.");
      return;
    }
    try {
      const rec = new Ctor();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = "en-US";
      rec.onresult = (e) => {
        const chunk = e.results[0]?.[0]?.transcript?.trim() ?? "";
        if (chunk) {
          setText((prev) => (prev ? `${prev} ${chunk}` : chunk).trim());
        }
      };
      rec.onerror = () => {
        setVoiceError("Couldn’t catch that — try again or type.");
        setListening(false);
        recRef.current = null;
      };
      rec.onend = () => {
        setListening(false);
        recRef.current = null;
      };
      recRef.current = rec;
      rec.start();
      setListening(true);
    } catch {
      setVoiceError("Mic didn’t start — check permissions or type instead.");
      setListening(false);
    }
  }, []);

  const toggleMic = () => {
    if (listening) stopListening();
    else startListening();
  };

  const openAskDomoExternal = () => {
    window.open(askDomoChatUrl(text), "_blank", "noopener,noreferrer");
  };

  const callAskDomo = async (historyPayload: AskDomoHistoryEntry[]) => {
    const res = await fetch("/api/ask-domo", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ situation: text.trim(), history: historyPayload }),
    });
    const data = (await res.json()) as {
      coaching?: AskDomoStructured;
      error?: string;
      code?: string;
    };
    if (!res.ok) {
      if (data.code === "ASK_DOMO_PRO_ONLY") {
        setApiError(data.error ?? "Stack Pro required.");
        onRequestPro?.();
      } else if (data.code === "AUTH") {
        setApiError("Sign in to run coaching in Stack.");
      } else {
        setApiError(data.error ?? "Something went wrong.");
      }
      return null;
    }
    if (!data.coaching) {
      setApiError("Empty response — try again.");
      return null;
    }
    return data.coaching;
  };

  const runFirst = async () => {
    if (!canRunFirst || loading) return;
    setLoading(true);
    setApiError(null);
    try {
      const coaching = await callAskDomo([]);
      if (coaching) setHistory([{ role: "assistant", coaching }]);
    } catch {
      setApiError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  };

  const runFollowUp = async () => {
    if (!canFollowUp || loading) return;
    const u = followUp.trim();
    const nextHistory: AskDomoHistoryEntry[] = [...history, { role: "user", content: u }];
    setLoading(true);
    setApiError(null);
    try {
      const coaching = await callAskDomo(nextHistory);
      if (coaching) {
        setHistory([...nextHistory, { role: "assistant", coaching }]);
        setFollowUp("");
      }
    } catch {
      setApiError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (idx: number, t: string) => {
    try {
      await navigator.clipboard.writeText(t);
      setCopiedIndex(idx);
      window.setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <section
      className="border border-[color:var(--rm-border)] bg-[var(--rm-bg-elevated)] p-4 shadow-[0_12px_40px_rgba(0,0,0,0.25)] sm:p-5"
      aria-labelledby={`${inputId}-heading`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-300/90">Ask Domo · in Stack</p>
          <h2 id={`${inputId}-heading`} className="mt-1 text-sm font-semibold tracking-tight text-[var(--rm-text)]">
            Stuck on a situation?
          </h2>
          <p className="mt-1 max-w-xl text-[11px] leading-snug text-[var(--rm-text-muted)]">
            <strong className="font-medium text-[var(--rm-text)]">Stack Pro</strong> includes the same tactical shape as{" "}
            <span className="text-[var(--rm-text)]">askdomo.ai</span> — diagnosis, move, copy-paste text, and warm vs cold
            branches. Add follow-ups in this thread without leaving the app.
          </p>
        </div>
        {checked && isPro && threadActive ? (
          <button
            type="button"
            onClick={resetThread}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[color:var(--rm-border)] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.15em] text-[var(--rm-text-muted)] transition hover:border-violet-500/40 hover:text-[var(--rm-text)]"
          >
            <RotateCcw size={12} aria-hidden />
            New thread
          </button>
        ) : null}
      </div>

      <label htmlFor={inputId} className="sr-only">
        Describe your situation
      </label>
      <textarea
        id={inputId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        readOnly={threadActive}
        rows={3}
        placeholder="e.g. She watched my story but hasn&apos;t replied in three days — we were texting every day before…"
        className={`mt-4 w-full resize-y rounded-md border border-[color:var(--rm-border)] bg-[var(--rm-bg)] px-3 py-2.5 text-sm leading-relaxed text-[var(--rm-text)] placeholder:text-[var(--rm-text-muted)]/55 focus:border-violet-500/45 focus:outline-none focus:ring-1 focus:ring-violet-500/30 ${threadActive ? "opacity-80" : ""}`}
      />
      {threadActive ? (
        <p className="mt-1 text-[11px] text-[var(--rm-text-muted)]">
          Situation is locked for this thread — <button type="button" onClick={resetThread} className="underline underline-offset-2 hover:text-[var(--rm-text)]">New thread</button> to change it.
        </p>
      ) : null}

      {voiceError ? (
        <p className="mt-2 text-[11px] text-amber-200/90" role="status">
          {voiceError}
        </p>
      ) : null}

      {apiError ? (
        <p className="mt-2 text-[11px] text-rose-200/90" role="status">
          {apiError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {checked && isPro ? (
          <>
            {!threadActive ? (
              <button
                type="button"
                onClick={runFirst}
                disabled={!canRunFirst || loading}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white shadow-[0_0_20px_rgba(124,58,237,0.25)] transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                  <Sparkles size={14} strokeWidth={2} aria-hidden />
                )}
                Get the move
              </button>
            ) : null}
          </>
        ) : checked && !isPro ? (
          <>
            {onRequestPro ? (
              <button
                type="button"
                onClick={onRequestPro}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600/90 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-violet-500"
              >
                <Sparkles size={14} strokeWidth={2} aria-hidden />
                Unlock with Pro
              </button>
            ) : (
              <Link
                href="/login?mode=signup"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-violet-600/90 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-violet-500"
              >
                <Sparkles size={14} strokeWidth={2} aria-hidden />
                Get Stack Pro
              </Link>
            )}
          </>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--rm-border)] px-4 py-2 text-[11px] uppercase tracking-[0.2em] text-[var(--rm-text-muted)]">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            Checking access…
          </span>
        )}

        <button
          type="button"
          onClick={openAskDomoExternal}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-[color:var(--rm-border)] px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--rm-text-muted)] transition hover:border-violet-500/40 hover:text-[var(--rm-text)]"
        >
          <ExternalLink size={14} strokeWidth={2} aria-hidden />
          Open askdomo.ai
        </button>

        {!threadActive && voiceSupported ? (
          <button
            type="button"
            onClick={toggleMic}
            aria-pressed={listening}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.14em] transition ${
              listening
                ? "border-rose-500/50 bg-rose-500/15 text-rose-100"
                : "border-[color:var(--rm-border)] text-[var(--rm-text-muted)] hover:border-violet-500/40 hover:text-[var(--rm-text)]"
            }`}
          >
            {listening ? (
              <>
                <MicOff size={14} strokeWidth={2} aria-hidden />
                Stop
              </>
            ) : (
              <>
                <Mic size={14} strokeWidth={2} aria-hidden />
                Voice
              </>
            )}
          </button>
        ) : null}
      </div>

      {checked && !isPro ? (
        <p className="mt-2 text-[11px] text-[var(--rm-text-muted)]">
          In-app coaching is a <strong className="text-[var(--rm-text)]">Pro</strong> perk — same frameworks, no second
          subscription. Or use the external site anytime.
        </p>
      ) : null}

      {checked && isPro ? (
        <p className="mt-2 text-[11px] text-[var(--rm-text-muted)]">
          <strong className="text-[var(--rm-text)]">Open askdomo.ai</strong> anytime if you prefer the standalone chat.
        </p>
      ) : null}

      {history.length > 0 ? (
        <div className="mt-6 space-y-6">
          {(() => {
            let assistantIdx = -1;
            return history.map((entry, i) => {
              if (entry.role === "user") {
                return (
                  <div
                    key={`h-${i}`}
                    className="rounded-md border border-[color:var(--rm-border)]/80 bg-[var(--rm-bg)]/60 px-3 py-2.5"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--rm-text-muted)]">
                      Your follow-up
                    </p>
                    <p className="mt-1 text-sm text-[var(--rm-text)]">{entry.content}</p>
                  </div>
                );
              }
              assistantIdx += 1;
              return (
                <CoachingTurn
                  key={`h-${i}`}
                  coaching={entry.coaching}
                  turnIndex={assistantIdx}
                  copiedIndex={copiedIndex}
                  onCopy={handleCopy}
                />
              );
            });
          })()}
        </div>
      ) : null}

      {checked && isPro && lastIsAssistant ? (
        <div className="mt-6 border-t border-[color:var(--rm-border)]/60 pt-5">
          <label htmlFor={followUpId} className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300/85">
            Follow-up
          </label>
          <textarea
            id={followUpId}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            rows={2}
            placeholder="e.g. She just replied “lol” — what now? Or: I don’t want to sound needy…"
            className="mt-2 w-full resize-y rounded-md border border-[color:var(--rm-border)] bg-[var(--rm-bg)] px-3 py-2 text-sm leading-relaxed text-[var(--rm-text)] placeholder:text-[var(--rm-text-muted)]/55 focus:border-violet-500/45 focus:outline-none focus:ring-1 focus:ring-violet-500/30"
          />
          <button
            type="button"
            onClick={runFollowUp}
            disabled={!canFollowUp}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-violet-500/50 bg-violet-500/10 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-100 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Sparkles size={14} strokeWidth={2} aria-hidden />}
            Continue thread
          </button>
        </div>
      ) : null}
    </section>
  );
}
