/** Central caps for API bodies — reduces DoS / prompt-injection surface. */

export const LIMITS = {
  prospectName: 200,
  prospectPhone: 48,
  draftIncomingText: 12_000,
  draftVibeNotes: 6000,
  draftProspectName: 200,
  toneStyle: 32,
  checkoutSessionId: 128,
} as const;

export function clampStr(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}
