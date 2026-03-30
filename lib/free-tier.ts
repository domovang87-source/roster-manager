/**
 * Free tier (logged-in, no active subscription):
 * - One person on the roster (server: POST /api/prospects, generate-response, parse-screenshot).
 * - One AI draft on Home; regenerating that draft requires Pro (server + client).
 * - More than 1 person (legacy) → must upgrade to generate, import screenshots, or log new texts (client + APIs).
 * - Pulse / metrics stay visible.
 * - Message log cap for new logs when roster is compliant (inbox / quick touch).
 */
export const FREE_AI_DRAFTS = 1;

/** Max prospects on roster before adding more requires Pro. */
export const FREE_ROSTER_SLOTS = 1;

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

/**
 * Total rows in `messages` (manual logs + screenshot bubbles + quick touch, etc.).
 * New logs / imports / touch-base inserts require Pro at or above this count.
 */
export const FREE_MESSAGE_LOG_CAP = 5;
