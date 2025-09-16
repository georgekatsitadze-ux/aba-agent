import { test, expect } from "@playwright/test";

test("clinical page loads", async ({ page }) => {
  await page.goto("/clinical"); // use baseURL from playwright.config.ts (4173)
  await expect(page.getByRole("heading", { name: /Clinical: Goals & Sessions/i })).toBeVisible();
});
