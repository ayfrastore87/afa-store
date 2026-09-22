"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { theme: Theme; setTheme: (theme: Theme) => void; toggleTheme: () => void };
const STORAGE_KEY = "afa-theme";
const ThemeContext = createContext<ThemeContextValue | null>(null);

function readDocumentTheme(): Theme {
  if (typeof document !== "undefined") {
    const marker = document.documentElement.dataset.theme;
    if (marker === "dark" || marker === "light") return marker;
  }
  return "light";
}

function applyTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  document.body.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readDocumentTheme);

  useEffect(() => {
    // The pre-paint script has already resolved storage/system preference. Keep
    // that value as the initial client state instead of briefly resetting it.
    const next = readDocumentTheme();
    setThemeState(next);
    applyTheme(next);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Theme still applies when storage is unavailable (private mode, etc.).
    }
    setThemeState(next);
    applyTheme(next);
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [setTheme, theme]);
  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}

export const THEME_STORAGE_KEY = STORAGE_KEY;
