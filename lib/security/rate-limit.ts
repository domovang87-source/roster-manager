type Bucket = { count: number; resetAt: number };
const store = new Map<string, Bucket>();

function pruneStale(now: number) {
  if (Math.random() > 0.02) return;
  for (const [k, b] of store) {
    if (now > b.resetAt + 120_000) store.delete(k);
  }
}

/**
 * Fixed-window-ish limiter (per server instance). Good enough to blunt abuse on Vercel;
 * upgrade to Redis/Upstash for strict global limits.
 */
export function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  pruneStale(now);
  let b = store.get(key);
  if (!b || now >= b.resetAt) {
    b = { count: 1, resetAt: now + windowMs };
    store.set(key, b);
    return { ok: true };
  }
  if (b.count >= max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true };
}

export function getRequestIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}

/** Presets per route class (per user id when logged in, else IP). */
export const RATE = {
  askDomo: { max: 40, windowMs: 60 * 60 * 1000 },
  generateDraft: { max: 80, windowMs: 60 * 60 * 1000 },
  parseScreenshot: { max: 40, windowMs: 60 * 60 * 1000 },
  dailyNarrative: { max: 120, windowMs: 60 * 60 * 1000 },
  webhook: { max: 200, windowMs: 60 * 60 * 1000 },
  metrics: { max: 200, windowMs: 60 * 60 * 1000 },
  checkSubscription: { max: 400, windowMs: 60 * 60 * 1000 },
  createCheckout: { max: 25, windowMs: 60 * 60 * 1000 },
  verifyCheckout: { max: 40, windowMs: 60 * 60 * 1000 },
} as const;
