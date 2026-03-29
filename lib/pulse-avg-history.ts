/** Rolling weekly average roster momentum (0–100, device-local) for Pulse charts. */

const KEY = "stack_pulse_avg_by_week_v1";

export type PulseWeekAvg = { week: string; avg: number; at: number };

export function recordPulseWeekAvg(weekKey: string, avg: number): void {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const list: PulseWeekAvg[] = raw ? JSON.parse(raw) : [];
    const i = list.findIndex((x) => x.week === weekKey);
    const row: PulseWeekAvg = { week: weekKey, avg, at: Date.now() };
    if (i >= 0) list[i] = row;
    else list.push(row);
    list.sort((a, b) => a.week.localeCompare(b.week));
    localStorage.setItem(KEY, JSON.stringify(list.slice(-16)));
  } catch {
    /* ignore */
  }
}

export function readPulseAvgHistory(): PulseWeekAvg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PulseWeekAvg[]) : [];
  } catch {
    return [];
  }
}
