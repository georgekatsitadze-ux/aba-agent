import { test, expect } from "@playwright/test";

test("billing page lists sample invoices", async ({ page }) => {
  await page.goto("/billing"); // use baseURL from playwright.config.ts (4173)
  await expect(page.getByRole("heading", { name: /Billing/i })).toBeVisible();
  await expect(page.getByText("Submitted")).toBeVisible();
  await expect(page.getByText("Draft")).toBeVisible();
});
