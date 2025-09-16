import { test, expect } from "@playwright/test";

test("patients page shows Ada when searching", async ({ page }) => {
  await page.goto("http://localhost:5173/patients");
  await page.fill('input[placeholder="Search..."]', "Ada");
  await expect(page.getByText("Ada Lovelace")).toBeVisible();
});
