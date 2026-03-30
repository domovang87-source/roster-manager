/**
 * Free tier (logged-in, no active subscription / NULL subscription):
 * - One person on the roster (server: POST /api/prospects, generate-response, parse-screenshot).
 * - One AI draft on Home; regenerating that draft requires Pro (server + client).
 * - More than 1 person (legacy) → must upgrade to generate, import screenshots, or log new texts (client + APIs).
 * - Pulse / metrics stay visible for everyone with data.
 * - Texts: exactly one “logging unit” — either one screenshot import batch (any number of bubbles, same import_batch_id)
 *   OR one manual log (one or more rows without a batch id, typically a single note/text). Not both. Pro: unlimited.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const FREE_AI_DRAFTS = 1;

/** Max prospects on roster before adding more requires Pro. */
export const FREE_ROSTER_SLOTS = 1;

/**
 * @deprecated Legacy row cap; free logging is now one batch OR one manual unit. Kept for any external docs.
 */
export const FREE_MESSAGE_LOG_CAP = 5;

/**
 * No active subscription but more people on roster than free allows (e.g. legacy signups).
 * They must upgrade (or remove people) to generate drafts, log texts, or import screenshots.
 */
export function freeUserOverRosterLimit(prospectCount: number, isPro: boolean): boolean {
  return !isPro && prospectCount > FREE_ROSTER_SLOTS;
}

/**
 * UI gate for “upgrade to add more” — conservative until subscription is confirmed.
 * Server-side POST /api/prospects enforces the limit using the same RLS-visible rows as the roster list
 * (not `.eq("user_id")` alone, so legacy NULL user_id rows can’t bypass the cap).
 */
export function rosterRequiresUpgradeForUi(
  prospectCount: number,
  subscriptionChecked: boolean,
  isPro: boolean
): boolean {
  if (prospectCount < FREE_ROSTER_SLOTS) return false;
  return !(subscriptionChecked && isPro);
}

export type FreeLoggingCounts = {
  totalMessages: number;
  distinctImportBatches: number;
  manualOnlyMessages: number;
};

export function deriveFreeLoggingCountsFromRows(rows: { import_batch_id?: string | null }[]): {
  rowSampleSize: number;
  distinctImportBatches: number;
  manualOnlyMessages: number;
} {
  const batches = new Set<string>();
  let manual = 0;
  for (const r of rows) {
    const b = r.import_batch_id;
    if (b != null && String(b).trim() !== "") {
      batches.add(String(b));
    } else {
      manual += 1;
    }
  }
  return {
    rowSampleSize: rows.length,
    distinctImportBatches: batches.size,
    manualOnlyMessages: manual,
  };
}

/**
 * Pro or subscription not loaded yet → allow. Otherwise allow only before the first free “unit” exists:
 * - With import_batch_id: no batch and no manual-only rows yet.
 * - Without column: no messages yet (first save may insert many rows at once).
 */
export function freeTierLoggingAllowed(
  isPro: boolean,
  subscriptionChecked: boolean,
  counts: FreeLoggingCounts,
  hasImportBatchColumn: boolean
): boolean {
  if (!subscriptionChecked || isPro) return true;
  if (!hasImportBatchColumn) {
    return counts.totalMessages === 0;
  }
  return counts.distinctImportBatches === 0 && counts.manualOnlyMessages === 0;
}

const FREE_LOGGING_SAMPLE_LIMIT = 12_000;

/** Load counts for free-tier logging gates (Texts + Home quick touch). */
export async function fetchFreeLoggingCounts(
  client: SupabaseClient
): Promise<{ counts: FreeLoggingCounts; hasImportBatchColumn: boolean }> {
  const { count: totalMessages, error: countErr } = await client
    .from("messages")
    .select("id", { count: "exact", head: true });

  const total = countErr ? 0 : (totalMessages ?? 0);

  const { data, error } = await client
    .from("messages")
    .select("import_batch_id")
    .limit(FREE_LOGGING_SAMPLE_LIMIT);

  const msg = error?.message ?? "";
  if (
    error &&
    (msg.includes("import_batch_id") || (msg.includes("column") && msg.toLowerCase().includes("import_batch")))
  ) {
    return {
      counts: {
        totalMessages: total,
        distinctImportBatches: 0,
        manualOnlyMessages: total,
      },
      hasImportBatchColumn: false,
    };
  }

  if (error || !data) {
    return {
      counts: {
        totalMessages: total,
        distinctImportBatches: 0,
        manualOnlyMessages: total,
      },
      hasImportBatchColumn: true,
    };
  }

  const derived = deriveFreeLoggingCountsFromRows(data as { import_batch_id?: string | null }[]);
  return {
    counts: {
      totalMessages: Math.max(total, derived.rowSampleSize),
      distinctImportBatches: derived.distinctImportBatches,
      manualOnlyMessages: derived.manualOnlyMessages,
    },
    hasImportBatchColumn: true,
  };
}
