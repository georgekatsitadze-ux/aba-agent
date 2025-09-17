import { Theme } from "./themes";
export function applyTheme(theme: Theme) {
  const r = document.documentElement;
  Object.entries(theme.cssVars).forEach(([k,v]) => r.style.setProperty(k, v));
  localStorage.setItem("theme", theme.name);
}
export function loadSavedTheme(themes: Theme[]) {
  const name = localStorage.getItem("theme");
  return themes.find(t => t.name === name) || themes[0];
}
