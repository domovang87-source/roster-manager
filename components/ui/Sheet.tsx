"use client";

import React from "react";
import { X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** "bottom" = mobile bottom-sheet style, "center" = centered dialog */
  position?: "center" | "bottom";
  children: React.ReactNode;
  /** Hide the built-in close button (e.g. when the caller supplies its own) */
  hideClose?: boolean;
};

export default function Sheet({
  open,
  onClose,
  title,
  position = "bottom",
  children,
  hideClose,
}: Props) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  React.useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  const positionClasses =
    position === "center"
      ? "items-center justify-center"
      : "items-end sm:items-center sm:justify-center";

  return (
    <div
      className={`fixed inset-0 z-[100] flex px-4 py-6 ${positionClasses}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        aria-hidden
      />

      <div className="relative w-full max-w-md rounded-lg border border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] p-5 shadow-2xl sm:p-6">
        {(title || !hideClose) && (
          <div className="mb-4 flex items-start justify-between gap-3">
            {title ? (
              <h2 className="text-base font-semibold text-[var(--rm-text)]">{title}</h2>
            ) : <span />}
            {!hideClose && (
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded p-1 text-[var(--rm-text-muted)] transition hover:text-[var(--rm-text)]"
                aria-label="Close"
              >
                <X size={16} strokeWidth={1.5} />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
