/**
 * Returns a human-friendly label for when a draft will auto-send.
 * - scheduled_for null or in past: "Ready to send" or "No schedule"
 * - < 2 min: "Sending in 1 min"
 * - < 1 hr: "Sending in X min"
 * - < 5 hrs: "Sending in X hrs"
 * - Same day: "Today at 2pm"
 * - Next day: "Tomorrow at 2pm"
 * - Later: "Mar 15 at 2pm"
 */
export function formatScheduledFor(scheduledFor: string | null): string {
  if (!scheduledFor) return "Ready to send";
  const then = new Date(scheduledFor);
  const now = new Date();
  if (then.getTime() <= now.getTime()) return "Ready to send";

  const ms = then.getTime() - now.getTime();
  const min = Math.floor(ms / 60_000);
  const hrs = Math.floor(ms / 3_600_000);
  const days = Math.floor(ms / 86_400_000);

  if (min < 2) return "Sending in 1 min";
  if (min < 60) return `Sending in ${min} min`;
  if (hrs < 5) return `Sending in ${hrs} hr${hrs === 1 ? "" : "s"}`;
  if (hrs < 24) return `Sending in ${hrs} hrs`;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const thenDay = new Date(then);
  thenDay.setHours(0, 0, 0, 0);

  const timeStr = then.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (thenDay.getTime() === today.getTime()) return `Today at ${timeStr}`;
  if (thenDay.getTime() === tomorrow.getTime())
    return `Tomorrow at ${timeStr}`;

  return `${then.toLocaleDateString([], { month: "short", day: "numeric" })} at ${timeStr}`;
}
