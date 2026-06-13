import { test, expect } from "@playwright/test";

test("signup new user and land on main app", async ({ page }) => {
  const unique_email = `e2e-${Date.now()}@example.com`;
  const password = "E2Epassword1";

  await page.goto("/");

  // Switch to signup mode
  await page.getByText("新規登録").click();

  // Fill in signup fields
  await page.locator("#auth-email").fill(unique_email);
  await page.locator("#auth-password").fill(password);

  // Submit signup form
  await page.getByRole("button", { name: "アカウント作成" }).click();

  // Assert the main app rendered (home nav item visible)
  await expect(page.getByText("ホーム")).toBeVisible();
});
