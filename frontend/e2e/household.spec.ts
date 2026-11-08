import { test, expect, type Browser, type Page } from "@playwright/test";

// Two users sharing a household (#207): one creates it and invites, the other
// joins by code or link, and entries in the household view reach both while
// each allowance stays private.

const PASSWORD = "E2Epassword1";

async function openUser(browser: Browser, label: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // See happy-path.spec.ts: web fonts are blocked in the devcontainer.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto("/");
  await page.getByText("新規登録").click();
  // A random suffix keeps parallel workers from colliding on the address.
  const unique_suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.locator("#auth-email").fill(`e2e-${label}-${unique_suffix}@example.com`);
  await page.locator("#auth-password").fill(PASSWORD);
  await page.getByRole("button", { name: "アカウント作成" }).click();
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");
  return page;
}

function syncPill(page: Page) {
  return page.getByRole("button", { name: /^同期状態:/ }).first();
}

async function openAccount(page: Page) {
  await page.getByTitle("アカウント").first().click();
}

async function openTab(page: Page, tab_label: RegExp) {
  await page.getByRole("button", { name: tab_label }).first().click();
}

// Coming back to the foreground makes the engine sync.
async function afterSync(page: Page, check: () => Promise<void>) {
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await check();
  }).toPass({ timeout: 20_000, intervals: [500, 1000, 2000] });
}

async function recordExpense(page: Page, amount: string, item: string) {
  await openTab(page, /ホーム/);
  await page.getByRole("button", { name: /食費/ }).first().click();
  await page.getByRole("button", { name: "スーパー・自炊" }).click();
  await page.getByPlaceholder("0").fill(amount);
  await page.getByPlaceholder("例：唐揚げ定食").fill(item);
  await page.getByText("＋ 記録する").click();
}

async function createHouseholdWithInvitation(page: Page) {
  await openAccount(page);
  await page.getByLabel("家計の名前").fill("E2E家計");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByText("E2E家計")).toBeVisible();
  await page.getByRole("button", { name: "招待を作成" }).click();
  const created_invitation = page.getByLabel("作成した招待");
  await expect(created_invitation.getByTestId("invitation-code")).toHaveText(/^[A-Z2-9]{8}$/);
  return {
    short_code: (await created_invitation.getByTestId("invitation-code").textContent()) ?? "",
    link: await created_invitation.getByLabel("招待リンク").inputValue(),
  };
}

const ledger_switch = (page: Page) => page.getByRole("group", { name: "表示する帳簿" });

test("members share household entries and keep their allowance apart", async ({ browser }) => {
  const owner_page = await openUser(browser, "household-owner");
  const partner_page = await openUser(browser, "household-partner");
  const { short_code } = await createHouseholdWithInvitation(owner_page);

  await openAccount(partner_page);
  await partner_page.getByLabel("招待コード").fill(short_code.toLowerCase());
  await partner_page.getByRole("button", { name: "参加", exact: true }).click();
  await expect(partner_page.getByText("E2E家計")).toBeVisible();
  await expect(partner_page.getByText(/メンバー · 2人/)).toBeVisible();

  // The household view is the default once attached.
  await recordExpense(partner_page, "1200", "E2E共同の買い物");
  await openTab(owner_page, /仕訳/);
  await expect(ledger_switch(owner_page).getByRole("button", { name: "家計" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await afterSync(owner_page, () =>
    expect(owner_page.getByText("E2E共同の買い物", { exact: true })).toBeVisible()
  );

  // An allowance entry stays in the partner's own ledger.
  await ledger_switch(partner_page).getByRole("button", { name: "お小遣い" }).click();
  await recordExpense(partner_page, "500", "E2Eお小遣いの買い物");
  await openTab(partner_page, /仕訳/);
  await expect(partner_page.getByText("E2Eお小遣いの買い物", { exact: true })).toBeVisible();
  await expect(partner_page.getByText("E2E共同の買い物", { exact: true })).toBeHidden();
  await afterSync(owner_page, async () => {
    await expect(owner_page.getByText("E2E共同の買い物", { exact: true })).toBeVisible();
    await expect(owner_page.getByText("E2Eお小遣いの買い物", { exact: true })).toBeHidden();
  });
  // Only the partner's spending total reaches the owner.
  await openAccount(owner_page);
  await afterSync(owner_page, () =>
    expect(owner_page.getByRole("listitem").filter({ hasNotText: "（自分）" })).toContainText(
      "今月 使った ¥500"
    )
  );
});

test("an invitation link joins after confirming, and a member who leaves keeps a read-only copy", async ({
  browser,
}) => {
  const owner_page = await openUser(browser, "household-link-owner");
  const partner_page = await openUser(browser, "household-link-partner");
  const { link } = await createHouseholdWithInvitation(owner_page);

  await partner_page.goto(link);
  await expect(partner_page.getByText("招待リンクから家計に参加しますか？")).toBeVisible();
  // The token is taken out of the address bar right away.
  expect(new URL(partner_page.url()).hash).toBe("");
  await partner_page.getByRole("button", { name: "参加する" }).click();
  await expect(partner_page.getByText("E2E家計")).toBeVisible();

  // A household entry, on the server (the partner sees it) before the partner leaves.
  await recordExpense(owner_page, "2300", "E2E家計の夕食");
  await openTab(partner_page, /仕訳/);
  await afterSync(partner_page, () =>
    expect(partner_page.getByText("E2E家計の夕食", { exact: true })).toBeVisible()
  );
  await openAccount(partner_page);

  await partner_page.getByRole("button", { name: "家計から抜ける" }).click();
  await partner_page.getByRole("button", { name: "抜ける", exact: true }).click();
  await expect(partner_page.getByLabel("招待コード")).toBeVisible();
  await expect(partner_page.getByText("家計の記録は「過去の家計」に残っています")).toBeVisible();
  await partner_page.getByRole("button", { name: /E2E家計/ }).click();
  await expect(partner_page.getByText("閲覧専用")).toBeVisible();
  await expect(partner_page.getByText("E2E家計の夕食")).toBeVisible();
  await expect(partner_page.getByRole("button", { name: "✎" })).toHaveCount(0);
  // Browser Back returns to the account screen.
  await partner_page.goBack();
  await expect(partner_page.getByLabel("招待コード")).toBeVisible();
  await openAccount(owner_page);
  await afterSync(owner_page, () => expect(owner_page.getByText(/オーナー · 1人/)).toBeVisible());
});
