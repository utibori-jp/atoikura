import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const API_BASE = process.env.VITE_API_URL ?? "http://localhost:8080";
const SYNC_PROTOCOL_HEADERS = { "X-Atoikura-Sync-Protocol": "1" };

// New ledgers start without categories; the master screen moves to the local
// database in a later step, so the test creates them through the REST commands.
async function createFoodCategory(request: APIRequestContext, email: string, password: string) {
  const token_response = await request.post(`${API_BASE}/auth/token`, {
    data: { email, password },
  });
  const { access_token } = await token_response.json();
  const headers = { ...SYNC_PROTOCOL_HEADERS, Authorization: `Bearer ${access_token}` };
  const group_response = await request.post(`${API_BASE}/ledger/category-groups`, {
    headers,
    data: { name: "食費", statement_type_code: "food" },
  });
  expect(group_response.ok()).toBe(true);
  const group_row = await group_response.json();
  const category_response = await request.post(`${API_BASE}/ledger/expense-categories`, {
    headers,
    data: { group_id: group_row.id, name: "スーパー" },
  });
  expect(category_response.ok()).toBe(true);
}

function syncPill(page: Page) {
  return page.getByRole("button", { name: /^同期状態:/ }).first();
}

async function syncNow(page: Page) {
  await syncPill(page).click();
  await page.getByRole("button", { name: "今すぐ同期" }).click();
  await page.keyboard.press("Escape");
}

async function recordOnHome(page: Page, amount: string) {
  await page
    .getByRole("button", { name: /ホーム/ })
    .first()
    .click();
  await page.getByRole("button", { name: /食費/ }).first().click();
  await page.getByRole("button", { name: "スーパー" }).click();
  await page.getByPlaceholder("0").fill(amount);
  await page.getByText("＋ 記録する").click();
}

test("journal entries are written on the device, work offline and reach the server", async ({
  page,
  context,
  request,
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

  await createFoodCategory(request, email, password);
  await syncNow(page);

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
