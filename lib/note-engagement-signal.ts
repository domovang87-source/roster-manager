/**
 * When someone logs a private note like “they sent a 10 min voice memo, then I texted,”
 * screenshot import never created an inbound row for the voice memo. We add a small
 * virtual “inbound weight” for balance. Notes that describe real-world touch (dates,
 * calls, meetups) also count toward Style cadence and touch-base tallies in roster-portfolio-compute.
 */
const MAX_CREDIT_PER_THREAD = 8;

/** True if this note should reset “days since you touched this thread” vs Logic Lab frequency. */
export function noteCountsForStyleCadence(body: string): boolean {
  const raw = body.trim();
  if (raw.length < 4) return false;
  const b = raw.toLowerCase();
  if (b.includes("touched base")) return true;
  return /\b(date|dates|dating|hang\s*out|hung\s*out|hangout|meet|meeting|met\s|met up|meet up|link up|pull up|call\b|called|phone\b|phoned|facetime|face\s*time|video\s*call|coffee|drinks|dinner|lunch|brunch|grab|saw her|saw him|saw them|in person|irl|visited|went over|went out|weeks?\b|months?\b|tomorrow|tonight|again)\b/i.test(
    raw
  );
}

export function theirEngagementCreditFromNoteBody(body: string): number {
  const raw = body.trim();
  if (raw.length < 6) return 0;
  const b = raw.toLowerCase();
  let n = 0;

  if (
    /\b(voice\s*memo|voice\s*note|voice\s*message|audio\s*message|voicemail|10\s*minute|long\s+voice)\b/i.test(
      raw
    )
  ) {
    n += 4;
  }
  if (/\b(facetime|face\s*time|video\s*call)\b/i.test(raw)) {
    n += 3;
  }
  if (/\b(called\s+me|phoned\s+me|phone\s*call|i\s+called|we\s+called)\b/i.test(b)) {
    n += 3;
  }
  if (/\b(he|she|they)\s+sent\s+me\b/i.test(b)) {
    n += 2;
  }
  if (/\bthey\s+(called|texted|dm|dmed)\b/i.test(b)) {
    n += 2;
  }
  // Real-life touch you logged in prose — helps momentum read notes, not only bubbles.
  if (/\b(date|dates|hang\s*out|hung\s*out|meet|meeting|met\s|met up|call\b|called|saw her|saw him|saw them|in person|went out|link up)\b/i.test(raw)) {
    n += 4;
  }
  if (/\b(weeks?|months?|tomorrow|tonight|again)\b/i.test(raw) && raw.length > 24) {
    n += 2;
  }

  return Math.min(MAX_CREDIT_PER_THREAD, n);
}

export function clampNoteEngagementCredit(sum: number): number {
  return Math.min(MAX_CREDIT_PER_THREAD, Math.max(0, sum));
}
