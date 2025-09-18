import { test } from "@playwright/test";

const themes = ["calm-sea","forest","midnight","sunrise"]; // expand as agent adds more

test("design snapshots", async ({ page }) => {
  await page.goto("/style");
  for (const name of themes) {
    // select theme by clicking its card button
    const btn = page.getByRole("button", { name: "Use" }).filter({ hasText: "" }); // fallback
    await page.evaluate((themeName) => localStorage.setItem("theme", themeName), name);
    await page.reload();

    // take a few page shots with this theme
    await page.goto("/");            await page.screenshot({ path: `test-results/design-home-${name}.png`, fullPage: true });
    await page.goto("/patients");    await page.screenshot({ path: `test-results/design-patients-${name}.png`, fullPage: true });
    await page.goto("/billing");     await page.screenshot({ path: `test-results/design-billing-${name}.png`, fullPage: true });
    await page.goto("/schedule");    await page.screenshot({ path: `test-results/design-schedule-${name}.png`, fullPage: true });
    await page.goto("/clinical");    await page.screenshot({ path: `test-results/design-clinical-${name}.png`, fullPage: true });
  }
});
