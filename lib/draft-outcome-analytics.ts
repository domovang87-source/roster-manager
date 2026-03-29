/**
 * Local-only "shadow" draft analytics: success = next screenshot import for that prospect
 * after a draft was generated. Stored in localStorage (no server / no push required).
 */

const PENDING_KEY = "stack_shadow_pending_draft_by_prospect_v1";
const OUTCOMES_KEY = "stack_shadow_draft_outcomes_v1";
const MAX_OUTCOMES = 200;

type PendingByProspect = Record<string, { draftId: string; createdAt: number }>;

export type DraftOutcomeRecord = {
  draftId: string;
  prospectId: string;
  outcome: "success" | "fail";
  reason?: string;
  at: number;
};

function readPending(): PendingByProspect {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PENDING_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as PendingByProspect;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writePending(store: PendingByProspect) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_KEY, JSON.stringify(store));
}

function appendOutcome(row: DraftOutcomeRecord) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(OUTCOMES_KEY);
    const list: DraftOutcomeRecord[] = raw ? JSON.parse(raw) : [];
    const next = [row, ...(Array.isArray(list) ? list : [])].slice(0, MAX_OUTCOMES);
    window.localStorage.setItem(OUTCOMES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Call when an AI draft is saved (new or regenerate) — expects screenshot follow-up for this prospect. */
export function expectOutcomeAfterNextScreenshot(draftId: string, prospectId: string) {
  const store = readPending();
  const prev = store[prospectId];
  if (prev && prev.draftId !== draftId) {
    appendOutcome({
      draftId: prev.draftId,
      prospectId,
      outcome: "fail",
      reason: "superseded",
      at: Date.now(),
    });
  }
  store[prospectId] = { draftId, createdAt: Date.now() };
  writePending(store);
}

/** Call after screenshot messages are saved on Log — marks pending draft as success. */
export function onScreenshotImportedForProspect(prospectId: string) {
  const store = readPending();
  const cur = store[prospectId];
  if (!cur) return;
  appendOutcome({
    draftId: cur.draftId,
    prospectId,
    outcome: "success",
    at: Date.now(),
  });
  delete store[prospectId];
  writePending(store);
}

export function readDraftOutcomesForDebug(): DraftOutcomeRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(OUTCOMES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
