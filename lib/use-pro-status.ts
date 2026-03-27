"use client";

import { useEffect, useState, useCallback } from "react";

const LS_KEY = "stack_pro";
const COOKIE_KEY = "stack_pro=1";

export function useProStatus() {
  const [isPro, setIsPro] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LS_KEY) === "1";
  });
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const cachedPro =
      localStorage.getItem(LS_KEY) === "1" ||
      document.cookie.includes(COOKIE_KEY);
    if (cachedPro) {
      setIsPro(true);
      setChecked(true);
    }

    fetch("/api/check-subscription")
      .then((r) => r.json())
      .then((data: { pro?: boolean }) => {
        const pro = data.pro === true;
        if (pro) {
          setIsPro(true);
          localStorage.setItem(LS_KEY, "1");
          document.cookie = "stack_pro=1; path=/; max-age=31536000; samesite=lax";
        }
        setChecked(true);
      })
      .catch(() => setChecked(true));
  }, []);

  const markPro = useCallback(() => {
    setIsPro(true);
    localStorage.setItem(LS_KEY, "1");
    document.cookie = "stack_pro=1; path=/; max-age=31536000; samesite=lax";
  }, []);

  return { isPro, checked, markPro };
}
