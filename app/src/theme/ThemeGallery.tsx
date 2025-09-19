import React from "react";
import { useTheme } from "./ThemeProvider";

export default function ThemeGallery() {
  const { theme, setTheme, all } = useTheme();
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h2>Theme Gallery</h2>
      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        }}
      >
        {all.map((t) => (
          <div
            key={t.name}
            className="card"
            style={{
              border:
                theme.name === t.name
                  ? "2px solid var(--primary)"
                  : "1px solid #e5e7eb",
            }}
          >
            <div
              style={{
                height: 120,
                borderRadius: 12,
                background: t.preview.bg,
                display: "grid",
                placeItems: "center",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ color: t.preview.fg, fontWeight: 600, fontSize: 22 }}>
                Aa
              </div>
              <div
                style={{
                  width: 48,
                  height: 10,
                  background: t.preview.accent,
                  borderRadius: 999,
                  marginTop: 8,
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 600 }}>{t.label}</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>{t.name}</div>
              </div>
              <button className="btn ghost" onClick={() => setTheme(t.name)}>
                Use
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
