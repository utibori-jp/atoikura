import { test, expect, type Page } from "@playwright/test";

// The static demo build (vite --mode demo): the real local DB and sync engine
// against the in-browser demo ledger server, with no backend.

function syncPill(page: Page) {
  return page.getByRole("button", { name: /^同期状態:/ }).first();
}

test("the demo starts signed in with sample data and records on the device", async ({ page }) => {
  // See happy-path.spec.ts: web fonts are blocked in the devcontainer.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto("./");
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");
  await expect(page.getByText("デモユーザー").first()).toBeVisible();
  await expect(page.getByText("今月あといくら使える？")).toBeVisible();
  await expect(page.getByText("予算を設定してください")).toHaveCount(0);

  // The sample categories are there, so an expense can be recorded.
  await page.getByRole("button", { name: /食費/ }).first().click();
  await page.getByRole("button", { name: "スーパー", exact: true }).click();
  await page.getByPlaceholder("0").fill("4321");
  await page.getByText("＋ 記録する").click();
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");
  await page.getByRole("button", { name: /仕訳/ }).first().click();
  await expect(page.getByText("¥4,321").first()).toBeVisible();

  // Online-only edits run as ledger commands: confirm this month's electricity bill.
  await page.getByRole("button", { name: /予算/ }).first().click();
  await page.getByText("定期支出", { exact: true }).click();
  await page.getByPlaceholder("8200").fill("9100");
  await page
    .getByPlaceholder("8200")
    .locator("..")
    .getByRole("button", { name: "金額を確定する" })
    .click();
  await expect(page.getByPlaceholder("8200")).toHaveCount(0);
  await expect(page.getByPlaceholder("3500")).toBeVisible();

  // A reload keeps the visitor's changes.
  await page.reload();
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");
  await page.getByRole("button", { name: /仕訳/ }).first().click();
  await expect(page.getByText("¥4,321").first()).toBeVisible();
  await expect(page.getByText("¥9,100").first()).toBeVisible();
});
