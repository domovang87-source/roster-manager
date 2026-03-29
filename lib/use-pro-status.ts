"use client";

import { useEffect, useState, useCallback } from "react";
import { getSupabaseClient } from "./supabase/client";

function clearProCache() {
  try {
    localStorage.removeItem("stack_pro");
    localStorage.removeItem("stack_elite");
  } catch {
    /* ignore */
  }
  document.cookie = "stack_pro=; path=/; max-age=0; samesite=lax";
  document.cookie = "stack_elite=; path=/; max-age=0; samesite=lax";
}

function setProCache(elite: boolean) {
  try {
    localStorage.setItem("stack_pro", "1");
    if (elite) localStorage.setItem("stack_elite", "1");
    else localStorage.removeItem("stack_elite");
  } catch {
    /* ignore */
  }
  document.cookie = "stack_pro=1; path=/; max-age=31536000; samesite=lax";
  if (elite) {
    document.cookie = "stack_elite=1; path=/; max-age=31536000; samesite=lax";
  } else {
    document.cookie = "stack_elite=; path=/; max-age=0; samesite=lax";
  }
}

type SubPayload = { pro: boolean; elite: boolean; lookupFailed: boolean };

async function fetchSubscriptionStatus(): Promise<SubPayload> {
  const r = await fetch("/api/check-subscription", { credentials: "same-origin" });
  const data = (await r.json()) as { pro?: boolean; elite?: boolean; lookupFailed?: boolean };
  if (data.lookupFailed) {
    return { pro: false, elite: false, lookupFailed: true };
  }
  return {
    pro: data.pro === true,
    elite: data.elite === true,
    lookupFailed: false,
  };
}

export function useProStatus() {
  const [isPro, setIsPro] = useState(false);
  const [isElite, setIsElite] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setChecked(true);
      return;
    }

    let cancelled = false;

    function applyFromServer(payload: SubPayload) {
      if (cancelled) return;
      if (payload.lookupFailed) {
        setChecked(true);
        return;
      }
      const pro = payload.pro;
      const elite = payload.elite;
      setIsPro(pro);
      setIsElite(pro && elite);
      if (pro) {
        setProCache(elite);
      } else {
        clearProCache();
      }
      setChecked(true);
    }

    async function syncFromServer() {
      try {
        const payload = await fetchSubscriptionStatus();
        if (cancelled) return;
        applyFromServer(payload);
      } catch {
        if (!cancelled) {
          clearProCache();
          setIsPro(false);
          setIsElite(false);
          setChecked(true);
        }
      }
    }

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;

      if (event === "SIGNED_OUT" || !session) {
        clearProCache();
        setIsPro(false);
        setIsElite(false);
        setChecked(true);
        return;
      }

      // Re-fetch when the logged-in user changes or on first hydration.
      // Skip TOKEN_REFRESHED to avoid hammering the API on silent refresh.
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "USER_UPDATED"
      ) {
        void syncFromServer();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const markPro = useCallback((opts?: { elite?: boolean }) => {
    const elite = opts?.elite === true;
    setIsPro(true);
    setIsElite(elite);
    setProCache(elite);
  }, []);

  return { isPro, isElite, checked, markPro };
}
