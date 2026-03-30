"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React from "react";
import { useProStatus } from "../lib/use-pro-status";

/**
 * Runs verify-checkout when Stripe redirects with ?session_id= on any tab route.
 * Required when the main app is paywalled: Home may not mount, so this lives on the layout.
 */
export default function CheckoutReturnHandler() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const { markPro, refreshFromServer } = useProStatus();
  const processedRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const sessionId = searchParams.get("session_id");
    if (!sessionId) return;
    if (processedRef.current === sessionId) return;
    processedRef.current = sessionId;

    const stripSessionParam = () => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("session_id");
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    };

    fetch("/api/verify-checkout", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then((r) => r.json())
      .then(async (data: { pro?: boolean; elite?: boolean; error?: string }) => {
        if (data.pro) {
          markPro({ elite: data.elite === true });
          await refreshFromServer();
        }
        stripSessionParam();
      })
      .catch(() => {
        stripSessionParam();
      });
  }, [searchParams, pathname, router, markPro, refreshFromServer]);

  return null;
}
