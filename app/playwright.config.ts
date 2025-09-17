// app/playwright.config.ts
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: { baseURL: "http://localhost:4173", trace: "on-first-retry" },
  webServer: {
    command: "npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
