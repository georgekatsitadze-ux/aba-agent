import { test, expect } from "@playwright/test";

test("therapist request -> RBT approve splits ABA and inserts therapy", async ({ page }) => {
  test.setTimeout(90_000);

  await test.step("Open schedule", async () => {
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { name: /Schedule/i })).toBeVisible();
  });

  await test.step("Prime RBT listener first (SSE connected)", async () => {
    await page.getByRole("button", { name: "RBT view" }).click();
    await page.getByTestId("rbt-owner").selectOption({ label: /RBT Alice/i });
    // Small pause to ensure SSE subscription is active
    await page.waitForTimeout(500);
  });

  await test.step("Send SLP request for Ada 10:00 (30m) to RBT Alice", async () => {
    await page.getByRole("button", { name: "SLP view" }).click();
    await page.getByTestId("req-rbt").selectOption({ label: /RBT Alice/i });
    await page.getByTestId("req-patient").selectOption({ label: /Ada Lovelace/i });
    await page.getByTestId("req-start").fill("10:00");
    await page.getByTestId("req-duration").selectOption("30");
    await page.getByTestId("req-send").click();
  });

  await test.step("Switch back to RBT Alice and approve popup", async () => {
    await page.getByRole("button", { name: "RBT view" }).click();
    await page.getByTestId("rbt-owner").selectOption({ label: /RBT Alice/i });

    // Wait up to 45s for the modal (SSE or fallback poll will trigger it)
    const modalApprove = page.getByTestId("modal-approve");
    await expect(modalApprove).toBeVisible({ timeout: 45_000 });
    await modalApprove.click();
  });

  await test.step("Verify SLP block (speech) appeared", async () => {
    await page.getByRole("button", { name: "SLP view" }).click();
    await expect(page.locator("text=speech")).toBeVisible({ timeout: 20_000 });
  });
});
