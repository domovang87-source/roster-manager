const KEY = "stack_portfolio_week_v1";

export type WeekBucket = {
  isoWeek: string;
  avg: number;
  byId: Record<string, number>;
  updatedAt: number;
};

export type PortfolioWeekStored = {
  current: WeekBucket | null;
  previous: WeekBucket | null;
};

/** ISO week in local timezone, e.g. `2026-W13`. */
export function getIsoWeekKeyLocal(d: Date): string {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

/**
 * Persists rolling weekly avg + per-prospect momentum. On ISO week change, rolls `current` → `previous`.
 * Returns last completed week’s avg and by-id map for WoW % and “trending” heuristics.
 */
export function syncPortfolioWeekStorage(
  isoWeek: string,
  avg: number,
  byId: Record<string, number>
): { prevAvg: number | null; prevById: Record<string, number> } {
  if (typeof window === "undefined") {
    return { prevAvg: null, prevById: {} };
  }

  let stored: PortfolioWeekStored;
  try {
    const raw = localStorage.getItem(KEY);
    stored = raw ? (JSON.parse(raw) as PortfolioWeekStored) : { current: null, previous: null };
  } catch {
    stored = { current: null, previous: null };
  }

  let prevAvg: number | null = null;
  let prevById: Record<string, number> = {};

  if (!stored.current) {
    stored = {
      current: { isoWeek, avg, byId: { ...byId }, updatedAt: Date.now() },
      previous: null,
    };
  } else if (stored.current.isoWeek === isoWeek) {
    prevAvg = stored.previous?.avg ?? null;
    prevById = stored.previous?.byId ? { ...stored.previous.byId } : {};
    stored = {
      ...stored,
      current: { isoWeek, avg, byId: { ...byId }, updatedAt: Date.now() },
    };
  } else {
    prevAvg = stored.current.avg;
    prevById = stored.current.byId ? { ...stored.current.byId } : {};
    stored = {
      previous: stored.current,
      current: { isoWeek, avg, byId: { ...byId }, updatedAt: Date.now() },
    };
  }

  localStorage.setItem(KEY, JSON.stringify(stored));
  return { prevAvg, prevById };
}
