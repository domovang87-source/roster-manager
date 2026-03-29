"use client";

import { useEffect, useState, useCallback } from "react";

function clearProCache() {
  try {
    localStorage.removeItem("stack_pro");
    localStorage.removeItem("stack_elite");
  } catch { /* ignore */ }
  document.cookie = "stack_pro=; path=/; max-age=0; samesite=lax";
  document.cookie = "stack_elite=; path=/; max-age=0; samesite=lax";
}

function setProCache(elite: boolean) {
  try {
    localStorage.setItem("stack_pro", "1");
    if (elite) localStorage.setItem("stack_elite", "1");
    else localStorage.removeItem("stack_elite");
  } catch { /* ignore */ }
  document.cookie = "stack_pro=1; path=/; max-age=31536000; samesite=lax";
  if (elite) {
    document.cookie = "stack_elite=1; path=/; max-age=31536000; samesite=lax";
  } else {
    document.cookie = "stack_elite=; path=/; max-age=0; samesite=lax";
  }
}

export function useProStatus() {
  // Start as false — never trust localStorage alone. Server is the source of truth.
  const [isPro, setIsPro] = useState(false);
  const [isElite, setIsElite] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/check-subscription", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data: { pro?: boolean; elite?: boolean; lookupFailed?: boolean }) => {
        if (data.lookupFailed) {
          // Can't verify — leave as false, don't grant Pro on uncertainty.
          setChecked(true);
          return;
        }
        const pro = data.pro === true;
        const elite = data.elite === true;
        setIsPro(pro);
        setIsElite(pro && elite);
        if (pro) {
          setProCache(elite);
        } else {
          clearProCache();
        }
        setChecked(true);
      })
      .catch(() => {
        clearProCache();
        setIsElite(false);
        setChecked(true);
      });
  }, []);

  const markPro = useCallback((opts?: { elite?: boolean }) => {
    const elite = opts?.elite === true;
    setIsPro(true);
    setIsElite(elite);
    setProCache(elite);
  }, []);

  return { isPro, isElite, checked, markPro };
}
