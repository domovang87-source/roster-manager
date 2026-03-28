"use client";

import { useEffect, useState } from "react";
import { getSupabaseClient } from "./supabase/client";

export function useSession() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;

    client.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    const { data: { subscription } } = client.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return { userId };
}
