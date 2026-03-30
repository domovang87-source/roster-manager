"use client";

import { Loader2 } from "lucide-react";
import { useProStatus } from "../lib/use-pro-status";

/**
 * Hard gate: do not render children until subscription + profile flags are loaded from the server.
 */
export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { checked } = useProStatus();

  if (!checked) {
    return (
      <div
        className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black text-white"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <Loader2 className="h-10 w-10 animate-spin text-white/85" aria-hidden />
        <p className="mt-5 max-w-xs text-center text-[10px] uppercase tracking-[0.35em] text-white/40">
          Verifying subscription…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
