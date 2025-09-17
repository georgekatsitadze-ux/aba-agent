export type Theme = {
  name: string;
  label: string;
  cssVars: Record<string, string>;
  preview: { bg: string; fg: string; accent: string };
};

export const themes: Theme[] = [
  {
    name: "calm-sea", label: "Calm Sea",
    cssVars: {
      "--bg":"#f4f9ff","--card":"#ffffff","--text":"#0f172a","--muted":"#64748b",
      "--primary":"#1e66f5","--primary-contrast":"#ffffff","--ring":"#9ec5fe",
      "--radius":"12px","--shadow":"0 8px 24px rgba(30,102,245,.12)"
    },
    preview:{ bg:"#f4f9ff", fg:"#0f172a", accent:"#1e66f5" }
  },
  {
    name: "forest", label: "Forest",
    cssVars: {
      "--bg":"#f6fbf7","--card":"#ffffff","--text":"#0b2e13","--muted":"#4b5563",
      "--primary":"#16a34a","--primary-contrast":"#ffffff","--ring":"#86efac",
      "--radius":"14px","--shadow":"0 8px 24px rgba(22,163,74,.12)"
    },
    preview:{ bg:"#f6fbf7", fg:"#0b2e13", accent:"#16a34a" }
  },
  {
    name: "midnight", label: "Midnight",
    cssVars: {
      "--bg":"#0b1220","--card":"#0f172a","--text":"#e5e7eb","--muted":"#94a3b8",
      "--primary":"#60a5fa","--primary-contrast":"#0b1220","--ring":"#60a5fa",
      "--radius":"12px","--shadow":"0 10px 30px rgba(0,0,0,.45)"
    },
    preview:{ bg:"#0b1220", fg:"#e5e7eb", accent:"#60a5fa" }
  },
  {
    name: "sunrise", label: "Sunrise",
    cssVars: {
      "--bg":"#fff7ed","--card":"#ffffff","--text":"#1f2937","--muted":"#6b7280",
      "--primary":"#f97316","--primary-contrast":"#ffffff","--ring":"#fdba74",
      "--radius":"16px","--shadow":"0 8px 24px rgba(249,115,22,.15)"
    },
    preview:{ bg:"#fff7ed", fg:"#1f2937", accent:"#f97316" }
  }
];
