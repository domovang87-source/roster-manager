"use client";

import React from "react";

type Variant = "success" | "error" | "neutral";

type ToastItem = {
  id: number;
  message: string;
  variant: Variant;
};

type ToastContextValue = {
  toast: (message: string, variant?: Variant) => void;
};

const ToastContext = React.createContext<ToastContextValue>({
  toast: () => {},
});

export function useToast() {
  return React.useContext(ToastContext);
}

const VARIANT_CLASSES: Record<Variant, string> = {
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  neutral: "border-[var(--rm-border)] bg-[var(--rm-bg-elevated)] text-[var(--rm-text)]",
};

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const toast = React.useCallback((message: string, variant: Variant = "neutral") => {
    const id = ++nextId;
    setItems((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-[120] flex flex-col items-center gap-2 px-4"
        aria-live="polite"
      >
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto rounded-lg border px-4 py-2.5 text-sm shadow-lg ${VARIANT_CLASSES[item.variant]}`}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
