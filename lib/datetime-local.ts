/**
 * `<input type="datetime-local">` values are "YYYY-MM-DDTHH:mm" with no timezone.
 * `new Date(thatString)` is inconsistent across browsers (esp. Safari / iOS).
 * Parse as explicit local wall time, then store UTC via ISO string.
 */
export function parseDatetimeLocalToUtcIso(value: string): string | null {
  const trimmed = value.trim();
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const sec = m[6] ? Number(m[6]) : 0;
  const local = new Date(y, mo, d, h, mi, sec, 0);
  if (Number.isNaN(local.getTime())) return null;
  return local.toISOString();
}

export function toLocalDatetimeInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
