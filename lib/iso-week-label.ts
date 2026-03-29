/**
 * Human-readable labels for ISO week keys like `2026-W12` used in Pulse charts.
 * We store `YYYY-Www` from local calendar math; bars are one Mon–Sun week each.
 */

export function parseIsoWeekKey(key: string): { year: number; week: number } | null {
  const m = key.trim().match(/^(\d{4})-W(\d{2})$/i);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) return null;
  return { year, week };
}

/** Monday 00:00 local for the given ISO week (week 1 contains Jan 4). */
export function isoWeekStartMondayLocal(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  jan4.setHours(0, 0, 0, 0);
  const isoDow = jan4.getDay() === 0 ? 7 : jan4.getDay();
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (isoDow - 1) + (week - 1) * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Short label under chart bars (space-constrained). */
export function formatIsoWeekAxisLabel(isoKey: string): string {
  const p = parseIsoWeekKey(isoKey);
  if (!p) return isoKey;
  const mon = isoWeekStartMondayLocal(p.year, p.week);
  return mon.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Hover / title: full context without requiring users to know ISO weeks. */
export function formatIsoWeekTooltipPrefix(isoKey: string): string {
  const p = parseIsoWeekKey(isoKey);
  if (!p) return "";
  const mon = isoWeekStartMondayLocal(p.year, p.week);
  const long = mon.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `Week of ${long}`;
}
