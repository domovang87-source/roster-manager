import { createHash, timingSafeEqual } from "crypto";

/** Constant-time compare for webhook secrets (length-independent via SHA-256 digest). */
export function timingSafeEqualUtf8(secret: string, provided: string | null | undefined): boolean {
  if (!secret || provided == null) return false;
  const a = createHash("sha256").update(secret, "utf8").digest();
  const b = createHash("sha256").update(String(provided), "utf8").digest();
  return timingSafeEqual(a, b);
}

export function getBearerToken(req: Request): string | null {
  const h = req.headers.get("authorization")?.trim();
  if (!h?.toLowerCase().startsWith("bearer ")) return null;
  const t = h.slice(7).trim();
  return t.length ? t : null;
}
