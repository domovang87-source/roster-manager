"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
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

export type AccountTier = "free" | "pro" | "elite";

export type ProStatusContextValue = {
  isPro: boolean;
  isElite: boolean;
  checked: boolean;
  /** Free / Pro / Elite once `checked`; null while subscription is still loading. */
  accountTier: AccountTier | null;
  markPro: (opts?: { elite?: boolean }) => void;
  /** Re-fetch Pro/Elite from `/api/check-subscription` (subscriptions + profiles). */
  refreshFromServer: () => Promise<void>;
};

const ProStatusContext = createContext<ProStatusContextValue | null>(null);

/**
 * Single subscription source for all tabs + BottomNav (avoids duplicate hook state).
 */
export function ProStatusProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = useState(false);
  const [isElite, setIsElite] = useState(false);
  const [checked, setChecked] = useState(false);

  const applyFromServer = useCallback((payload: SubPayload) => {
    if (payload.lookupFailed) {
      setIsPro(false);
      setIsElite(false);
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
  }, []);

  const refreshFromServer = useCallback(async () => {
    try {
      const payload = await fetchSubscriptionStatus();
      applyFromServer(payload);
    } catch {
      clearProCache();
      setIsPro(false);
      setIsElite(false);
      setChecked(true);
    }
  }, [applyFromServer]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setIsPro(false);
      setIsElite(false);
      setChecked(true);
      return;
    }

    let cancelled = false;

    function applyFromServerSafe(payload: SubPayload) {
      if (cancelled) return;
      applyFromServer(payload);
    }

    async function syncFromServer() {
      try {
        const payload = await fetchSubscriptionStatus();
        if (cancelled) return;
        applyFromServerSafe(payload);
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

      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "USER_UPDATED"
      ) {
        void syncFromServer();
      }
    });

    void client.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      if (session) {
        void syncFromServer();
      } else {
        clearProCache();
        setIsPro(false);
        setIsElite(false);
        setChecked(true);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [applyFromServer]);

  const markPro = useCallback((opts?: { elite?: boolean }) => {
    const elite = opts?.elite === true;
    setIsPro(true);
    setIsElite(elite);
    setProCache(elite);
  }, []);

  const accountTier = useMemo<AccountTier | null>(() => {
    if (!checked) return null;
    if (isElite) return "elite";
    if (isPro) return "pro";
    return "free";
  }, [checked, isPro, isElite]);

  const value = useMemo(
    () => ({ isPro, isElite, checked, accountTier, markPro, refreshFromServer }),
    [isPro, isElite, checked, accountTier, markPro, refreshFromServer]
  );

  return <ProStatusContext.Provider value={value}>{children}</ProStatusContext.Provider>;
}

export function useProStatus(): ProStatusContextValue {
  const ctx = useContext(ProStatusContext);
  if (!ctx) {
    throw new Error("useProStatus must be used within ProStatusProvider");
  }
  return ctx;
}
