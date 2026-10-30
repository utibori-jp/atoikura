import { test, expect, type Page } from "@playwright/test";

function syncPill(page: Page) {
  return page.getByRole("button", { name: /^同期状態:/ }).first();
}

async function recordOnHome(page: Page, amount: string) {
  await page
    .getByRole("button", { name: /ホーム/ })
    .first()
    .click();
  await page.getByRole("button", { name: /食費/ }).first().click();
  await page.getByRole("button", { name: "スーパー・自炊" }).click();
  await page.getByPlaceholder("0").fill(amount);
  await page.getByText("＋ 記録する").click();
}

test("journal entries are written on the device, work offline and reach the server", async ({
  page,
  context,
}) => {
  // See happy-path.spec.ts: web fonts are blocked in the devcontainer.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const email = `e2e-journal-${Date.now()}@example.com`;
  const password = "E2Epassword1";
  await page.goto("/");
  await page.getByText("新規登録").click();
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: "アカウント作成" }).click();
  await expect(syncPill(page)).toHaveAccessibleName(/同期済み/);

  await recordOnHome(page, "1234");
  // Queued, then pushed a moment later.
  await expect(syncPill(page)).toHaveAccessibleName(/未送信 1件/);
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");

  // Offline: the entry is stored on the device and waits to be sent.
  await context.setOffline(true);
  await recordOnHome(page, "567");
  await page.getByRole("button", { name: /仕訳/ }).first().click();
  await expect(page.getByText("¥1,234").first()).toBeVisible();
  await expect(page.getByText("¥567").first()).toBeVisible();
  await expect(syncPill(page)).toHaveAccessibleName(/未送信 1件/);

  // Back online it is sent on its own.
  await context.setOffline(false);
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");

  // Logging out deletes the device's copy; signing in again pulls both entries.
  await page.getByTitle("アカウント").first().click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.locator("form").getByRole("button", { name: "ログイン" }).click();
  await page.getByRole("button", { name: /仕訳/ }).first().click();
  await expect(page.getByText("¥1,234").first()).toBeVisible();
  await expect(page.getByText("¥567").first()).toBeVisible();
});
