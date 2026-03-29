/** ISO week in UTC (aligns with Vercel cron / server clock). */
export function getIsoWeekKeyUTC(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  date.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
  const week1 = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getUTCDay() + 6) % 7)) / 7
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function getPreviousIsoWeekKeyUTC(from: Date): string {
  const prev = new Date(from.getTime() - 7 * 86_400_000);
  return getIsoWeekKeyUTC(prev);
}
