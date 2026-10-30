import { test, expect, type Page } from "@playwright/test";

function syncPill(page: Page) {
  return page.getByRole("button", { name: /^同期状態:/ }).first();
}

async function openSavings(page: Page) {
  await page.getByRole("button", { name: /予算/ }).first().click();
  await page.getByText("貯金", { exact: true }).click();
  await expect(page.getByText("目的別に積み立てて、着実に前進")).toBeVisible();
}

test("budget screens read the local copy and edit through the server while online", async ({
  page,
  context,
}) => {
  // See happy-path.spec.ts: web fonts are blocked in the devcontainer.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  const email = `e2e-ledger-${Date.now()}@example.com`;
  const password = "E2Epassword1";
  await page.goto("/");
  await page.getByText("新規登録").click();
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.getByRole("button", { name: "アカウント作成" }).click();
  await expect(syncPill(page)).toHaveAccessibleName(/同期済み/);

  // A savings goal is created by a ledger command and shows from the local copy.
  await openSavings(page);
  await page.getByRole("button", { name: /貯金目標を追加/ }).click();
  await page.getByPlaceholder("旅行積立").fill("E2E旅行");
  await page.getByPlaceholder("20000").fill("15000");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("E2E旅行").first()).toBeVisible();
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");

  // Offline the goal stays readable but cannot be edited.
  await context.setOffline(true);
  await expect(
    page.getByText("オフラインのため閲覧のみです。接続すると編集できます")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /貯金目標を追加/ })).toBeDisabled();
  await expect(page.getByText("E2E旅行").first()).toBeVisible();

  // Back online editing returns.
  await context.setOffline(false);
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");
  await expect(page.getByRole("button", { name: /貯金目標を追加/ })).toBeEnabled();

  // Signing in again pulls the goal back from the server.
  await page.getByTitle("アカウント").first().click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(password);
  await page.locator("form").getByRole("button", { name: "ログイン" }).click();
  await openSavings(page);
  await expect(page.getByText("E2E旅行").first()).toBeVisible();
});
