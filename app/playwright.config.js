// @ts-check
import { defineConfig } from "@playwright/test";
export default defineConfig({
    testDir: "./tests",
    timeout: 60000,
    use: { baseURL: "http://localhost:4173", trace: "on-first-retry" },
    webServer: {
        command: "npm run build && npm run preview",
        url: "http://localhost:4173",
        timeout: 120000,
        reuseExistingServer: false
    }
});
