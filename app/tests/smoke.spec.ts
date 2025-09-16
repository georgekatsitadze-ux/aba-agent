import { test, expect } from "@playwright/test";

test("app shell renders", async ({ page }) => {
  await page.goto("/");                       // Playwright starts preview for us
  await expect(page).toHaveTitle(/Magellan ABA/i); // title from index.html
});
