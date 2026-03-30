import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Paid access from Supabase only (Stripe subscriptions + optional profiles flags).
 * Used by /api/check-subscription and /api/prospects — not client-local state.
 */
export async function resolvePaidAccessForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ pro: boolean; elite: boolean }> {
  let subscriptionPro = false;
  let subscriptionElite = false;

  let { data: subRows, error: subErr } = await supabase
    .from("subscriptions")
    .select("id, plan_tier")
    .eq("status", "active")
    .eq("user_id", userId)
    .limit(1);

  if (
    subErr &&
    (subErr.message?.includes("plan_tier") || subErr.message?.includes("column"))
  ) {
    const fb = await supabase
      .from("subscriptions")
      .select("id")
      .eq("status", "active")
      .eq("user_id", userId)
      .limit(1);
    subRows = fb.data as typeof subRows;
    subErr = fb.error;
  }

  if (!subErr && subRows?.[0]) {
    subscriptionPro = true;
    const row = subRows[0] as { plan_tier?: string | null };
    subscriptionElite = row.plan_tier === "elite";
  }

  let profilePro = false;
  let profileElite = false;
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("is_pro,is_elite")
    .eq("id", userId)
    .maybeSingle();

  if (!profErr && prof && typeof prof === "object") {
    const p = prof as { is_pro?: boolean | null; is_elite?: boolean | null };
    profilePro = p.is_pro === true;
    profileElite = p.is_elite === true;
  }

  const elite = subscriptionElite || profileElite;
  const pro = subscriptionPro || profilePro || elite;

  return { pro, elite };
}
