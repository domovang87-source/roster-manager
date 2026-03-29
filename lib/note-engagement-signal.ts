/**
 * When someone logs a private note like “they sent a 10 min voice memo, then I texted,”
 * screenshot import never created an inbound row for the voice memo. We add a small
 * virtual “inbound weight” for balance only — cadence still uses real logged texts.
 */
const MAX_CREDIT_PER_THREAD = 8;

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
  if (/\b(called\s+me|phoned\s+me|phone\s*call)\b/i.test(raw)) {
    n += 3;
  }
  if (/\b(he|she|they)\s+sent\s+me\b/i.test(b)) {
    n += 2;
  }
  if (/\bthey\s+(called|texted|dm|dmed)\b/i.test(b)) {
    n += 2;
  }

  return Math.min(MAX_CREDIT_PER_THREAD, n);
}

export function clampNoteEngagementCredit(sum: number): number {
  return Math.min(MAX_CREDIT_PER_THREAD, Math.max(0, sum));
}
