"use client";

import { useEffect, useState, useCallback } from "react";

function clearProCache() {
  try { localStorage.removeItem("stack_pro"); } catch { /* ignore */ }
  document.cookie = "stack_pro=; path=/; max-age=0; samesite=lax";
}

function setProCache() {
  try { localStorage.setItem("stack_pro", "1"); } catch { /* ignore */ }
  document.cookie = "stack_pro=1; path=/; max-age=31536000; samesite=lax";
}

export function useProStatus() {
  // Start as false — never trust localStorage alone. Server is the source of truth.
  const [isPro, setIsPro] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/check-subscription", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((data: { pro?: boolean; lookupFailed?: boolean }) => {
        if (data.lookupFailed) {
          // Can't verify — leave as false, don't grant Pro on uncertainty.
          setChecked(true);
          return;
        }
        const pro = data.pro === true;
        setIsPro(pro);
        if (pro) {
          setProCache();
        } else {
          clearProCache();
        }
        setChecked(true);
      })
      .catch(() => {
        clearProCache();
        setChecked(true);
      });
  }, []);

  const markPro = useCallback(() => {
    setIsPro(true);
    setProCache();
  }, []);

  return { isPro, checked, markPro };
}
