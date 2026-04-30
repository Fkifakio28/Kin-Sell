import { createContext, useContext, useLayoutEffect, useMemo } from "react";
import type { ReactNode } from "react";
import { SK_THEME } from "../../shared/constants/storage-keys";

type Theme = "dark";

type ThemeContextValue = {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    // Dark-only lock: force the DOM theme and remove stale persisted "light" values.
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
    try {
      localStorage.setItem(SK_THEME, "dark");
      localStorage.removeItem("theme");
    } catch {
      // Ignore storage failures (private mode, quota, disabled storage).
    }
  }, []);

  const value = useMemo(
    () => ({
      theme: "dark" as const,
      setTheme: () => {},
      toggleTheme: () => {}
    }),
    []
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme doit etre utilise dans ThemeProvider");
  }

  return context;
}
