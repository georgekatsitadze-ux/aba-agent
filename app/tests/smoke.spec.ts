import { test, expect } from "@playwright/test";

test("dashboard renders", async ({ page }) => {
  await page.goto("http://localhost:5173/");
  await expect(page.getByText("Welcome to the Dashboard")).toBeVisible();
});

