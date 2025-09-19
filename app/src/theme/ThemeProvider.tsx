import React from "react";
import { themes, Theme } from "./themes";
import { applyTheme, loadSavedTheme } from "./applyTheme";

type Ctx = { theme: Theme; setTheme: (name: string) => void; all: Theme[] };
const ThemeCtx = React.createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>(() => loadSavedTheme(themes));
  React.useEffect(() => { applyTheme(theme); }, [theme]);
  const setTheme = (name: string) => {
    const found = themes.find(t => t.name === name);
    if (found) setThemeState(found);
  };
  return (
    <ThemeCtx.Provider value={{ theme, setTheme, all: themes }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
