import { NextResponse } from "next/server";
import { checkRateLimit, getRequestIp } from "./rate-limit";

export function rateLimitExceeded(
  req: Request,
  userId: string | null,
  bucket: string,
  max: number,
  windowMs: number
): NextResponse | null {
  const key = userId ? `u:${userId}:${bucket}` : `ip:${getRequestIp(req)}:${bucket}`;
  const r = checkRateLimit(key, max, windowMs);
  if (r.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Try again in a bit.", code: "RATE_LIMIT" },
    {
      status: 429,
      headers: { "Retry-After": String(r.retryAfterSec) },
    }
  );
}
