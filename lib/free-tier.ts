/**
 * Free-tier limits — tune here for conversion vs friction.
 * Pro / Elite bypass all of these on the client (enforce critical paths server-side later if needed).
 */
export const FREE_AI_DRAFTS = 1;

/** Max prospects on roster before adding more requires Pro. */
export const FREE_ROSTER_SLOTS = 1;

/**
 * Total rows in `messages` (manual logs + screenshot bubbles + quick touch, etc.).
 * New logs / imports / touch-base inserts require Pro at or above this count.
 */
export const FREE_MESSAGE_LOG_CAP = 5;
