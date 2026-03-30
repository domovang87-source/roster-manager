export const RM_THEME_STORAGE_KEY = "rm-theme";

export type RmTheme = "plum" | "ink" | "blue";

export const RM_THEME_OPTIONS: { id: RmTheme; label: string; hint: string }[] = [
  { id: "plum", label: "Purple", hint: "Warm violet (default)" },
  { id: "ink", label: "Neutral", hint: "Near-black, cool gray" },
  { id: "blue", label: "Blue", hint: "Deep slate blue" },
];

export function getStoredRmTheme(): RmTheme {
  if (typeof window === "undefined") return "plum";
  const v = localStorage.getItem(RM_THEME_STORAGE_KEY);
  if (v === "ink" || v === "blue" || v === "plum") return v;
  return "plum";
}

/** Syncs DOM + localStorage. Plum uses :root tokens (no data attribute). */
export function applyRmTheme(theme: RmTheme): void {
  if (typeof document === "undefined") return;
  if (theme === "plum") {
    document.documentElement.removeAttribute("data-rm-theme");
  } else {
    document.documentElement.setAttribute("data-rm-theme", theme);
  }
  try {
    localStorage.setItem(RM_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore quota / private mode */
  }
}
