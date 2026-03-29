import { formatIsoWeekAxisLabel } from "./iso-week-label";
import { getIsoWeekKeyLocal } from "./portfolio-week-storage";

export type WeekVolume = { week: string; count: number; shortLabel: string };

/** Buckets message rows into ISO weeks over the last `sinceDays` days, newest last (max `maxWeeks`). */
export function messagesVolumeByWeek(
  rows: { created_at: string }[],
  sinceDays = 56,
  maxWeeks = 8
): WeekVolume[] {
  const cutoff = Date.now() - sinceDays * 86_400_000;
  const map = new Map<string, number>();
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (Number.isNaN(t) || t < cutoff) continue;
    const wk = getIsoWeekKeyLocal(new Date(r.created_at));
    map.set(wk, (map.get(wk) ?? 0) + 1);
  }
  const sorted = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const slice = sorted.slice(-maxWeeks);
  return slice.map(([week, count]) => ({
    week,
    count,
    shortLabel: formatIsoWeekAxisLabel(week),
  }));
}
