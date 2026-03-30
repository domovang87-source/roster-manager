import type { SupabaseClient } from "@supabase/supabase-js";

/** Rows that belong to this user (same rule as POST /api/prospects). */
export async function countOwnedProspectsForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data, error } = await supabase.from("prospects").select("id,user_id");
  if (error) return 0;
  const uid = userId;
  return (data ?? []).filter((r) => r.user_id != null && String(r.user_id) === uid).length;
}

/** All scheduled_replies tied to this user’s prospects (approx. AI draft generations). */
export async function countScheduledDraftsForUserProspects(
  supabase: SupabaseClient,
  userId: string
): Promise<number> {
  const { data: rows, error } = await supabase.from("prospects").select("id").eq("user_id", userId);
  if (error || !rows?.length) return 0;
  const ids = rows.map((r) => String(r.id));
  const { count, error: cErr } = await supabase
    .from("scheduled_replies")
    .select("id", { count: "exact", head: true })
    .in("prospect_id", ids);
  if (cErr) return 0;
  return count ?? 0;
}
