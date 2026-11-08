import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

// One user on two devices (#205): each browser context has its own local
// database, and both sync with the real server. Covers field-level LWW,
// tombstones, the notes merge, online-only data and the monthly posting.

const PASSWORD = "E2Epassword1";

interface Device {
  context: BrowserContext;
  page: Page;
}

async function openDevice(browser: Browser): Promise<Device> {
  const context = await browser.newContext();
  const page = await context.newPage();
  // See happy-path.spec.ts: web fonts are blocked in the devcontainer.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  return { context, page };
}

function syncPill(page: Page) {
  return page.getByRole("button", { name: /^同期状態:/ }).first();
}

async function signUp(page: Page, email: string) {
  await page.goto("/");
  await page.getByText("新規登録").click();
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(PASSWORD);
  await page.getByRole("button", { name: "アカウント作成" }).click();
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");
}

async function logIn(page: Page, email: string) {
  await page.goto("/");
  await page.locator("#auth-email").fill(email);
  await page.locator("#auth-password").fill(PASSWORD);
  await page.locator("form").getByRole("button", { name: "ログイン" }).click();
  await expect(syncPill(page)).toHaveAccessibleName("同期状態: 同期済み");
}

// Two devices of one fresh user, both signed in and synced.
async function openTwoDevices(browser: Browser, label: string): Promise<[Device, Device]> {
  const email = `e2e-${label}-${Date.now()}@example.com`;
  const phone = await openDevice(browser);
  await signUp(phone.page, email);
  const laptop = await openDevice(browser);
  await logIn(laptop.page, email);
  return [phone, laptop];
}

// Coming back to the foreground makes the engine sync.
async function triggerSync(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

// Syncs until the check passes: the other device's change may still be on its way.
async function afterSync(page: Page, check: () => Promise<void>) {
  await expect(async () => {
    await triggerSync(page);
    await check();
  }).toPass({ timeout: 20_000, intervals: [500, 1000, 2000] });
}

async function goOnline(device: Device) {
  await device.context.setOffline(false);
  await expect(syncPill(device.page)).toHaveAccessibleName("同期状態: 同期済み");
}

async function openTab(page: Page, tab_label: RegExp) {
  await page.getByRole("button", { name: tab_label }).first().click();
}

async function recordExpense(page: Page, amount: string, item: string) {
  await openTab(page, /ホーム/);
  await page.getByRole("button", { name: /食費/ }).first().click();
  await page.getByRole("button", { name: "スーパー・自炊" }).click();
  await page.getByPlaceholder("0").fill(amount);
  await page.getByPlaceholder("例：唐揚げ定食").fill(item);
  await page.getByText("＋ 記録する").click();
}

// The journal row of an entry: the innermost element holding its item and edit button.
function journalRow(page: Page, item: string) {
  return page
    .locator("div")
    .filter({ has: page.getByText(item, { exact: true }) })
    .filter({ has: page.getByRole("button", { name: "✎" }) })
    .last();
}

async function editEntry(page: Page, item: string, changes: { amount?: string; item?: string }) {
  await openTab(page, /仕訳/);
  await journalRow(page, item).getByRole("button", { name: "✎" }).click();
  const edit_dialog = page.getByRole("dialog", { name: "支出を編集" });
  if (changes.amount !== undefined) await edit_dialog.getByPlaceholder("0").fill(changes.amount);
  if (changes.item !== undefined)
    await edit_dialog.getByPlaceholder("例: コンビニ弁当").fill(changes.item);
  await edit_dialog.getByRole("button", { name: "保存する" }).click();
  await expect(edit_dialog).toBeHidden();
}

test("entries and offline edits from both devices merge field by field", async ({ browser }) => {
  const [phone, laptop] = await openTwoDevices(browser, "lww");

  await recordExpense(phone.page, "800", "E2E朝食");
  await openTab(laptop.page, /仕訳/);
  await afterSync(laptop.page, () => expect(journalRow(laptop.page, "E2E朝食")).toBeVisible());

  // Different fields edited offline on each device: both edits survive.
  await phone.context.setOffline(true);
  await laptop.context.setOffline(true);
  await editEntry(phone.page, "E2E朝食", { amount: "900" });
  await editEntry(laptop.page, "E2E朝食", { item: "E2E朝ごはん" });
  await goOnline(phone);
  await goOnline(laptop);
  for (const device of [phone, laptop]) {
    await afterSync(device.page, async () => {
      await expect(journalRow(device.page, "E2E朝ごはん")).toContainText("¥900");
    });
  }

  // The same field edited offline on both: the later edit wins everywhere.
  await phone.context.setOffline(true);
  await laptop.context.setOffline(true);
  await editEntry(phone.page, "E2E朝ごはん", { amount: "1000" });
  await editEntry(laptop.page, "E2E朝ごはん", { amount: "1100" });
  await goOnline(laptop);
  await goOnline(phone);
  for (const device of [phone, laptop]) {
    await afterSync(device.page, async () => {
      await expect(journalRow(device.page, "E2E朝ごはん")).toContainText("¥1,100");
    });
  }
});

test("a deletion on one device wins over an offline edit on the other", async ({ browser }) => {
  const [phone, laptop] = await openTwoDevices(browser, "tombstone");

  await recordExpense(phone.page, "500", "E2E残す");
  await recordExpense(phone.page, "700", "E2E消す");
  await openTab(laptop.page, /仕訳/);
  await afterSync(laptop.page, () => expect(journalRow(laptop.page, "E2E消す")).toBeVisible());

  await phone.context.setOffline(true);
  await laptop.context.setOffline(true);
  await openTab(phone.page, /仕訳/);
  await journalRow(phone.page, "E2E消す").getByRole("button", { name: "🗑" }).click();
  await phone.page.getByRole("button", { name: "削除", exact: true }).click();
  await editEntry(laptop.page, "E2E消す", { amount: "750" });
  await goOnline(laptop);
  await goOnline(phone);

  for (const device of [phone, laptop]) {
    await afterSync(device.page, async () => {
      await expect(device.page.getByText("E2E消す", { exact: true })).toHaveCount(0);
      await expect(journalRow(device.page, "E2E残す")).toBeVisible();
    });
  }
});

test("notes written offline on both devices for the same day are merged", async ({ browser }) => {
  const [phone, laptop] = await openTwoDevices(browser, "notes");

  // A day card to write the note on.
  await recordExpense(phone.page, "300", "E2Eメモの日");
  await openTab(phone.page, /仕訳/);
  await openTab(laptop.page, /仕訳/);
  await afterSync(laptop.page, () => expect(journalRow(laptop.page, "E2Eメモの日")).toBeVisible());

  await phone.context.setOffline(true);
  await laptop.context.setOffline(true);
  for (const [device, note] of [
    [phone, "スマホのメモ"],
    [laptop, "PCのメモ"],
  ] as const) {
    const note_field = device.page.getByPlaceholder("💭 この日のひとことを残す…");
    await note_field.fill(note);
    await note_field.blur();
    await expect(syncPill(device.page)).toHaveAccessibleName(/未送信 1件/);
  }
  await goOnline(phone);
  await goOnline(laptop);

  for (const device of [phone, laptop]) {
    await afterSync(device.page, async () => {
      const note_value = await device.page
        .getByPlaceholder("💭 この日のひとことを残す…")
        .inputValue();
      // Kept as two lines, in whichever order the server received them.
      expect(note_value.split("\n").sort()).toEqual(["PCのメモ", "スマホのメモ"]);
    });
  }
});

test("online-only data from one device is readable on the other, also offline", async ({
  browser,
}) => {
  const [phone, laptop] = await openTwoDevices(browser, "online-only");

  await openTab(phone.page, /予算/);
  await phone.page.getByText("貯金", { exact: true }).click();
  await phone.page.getByRole("button", { name: /貯金目標を追加/ }).click();
  await phone.page.getByPlaceholder("旅行積立").fill("E2E車");
  await phone.page.getByPlaceholder("20000").fill("10000");
  await phone.page.getByRole("button", { name: "保存" }).click();
  await expect(phone.page.getByText("E2E車").first()).toBeVisible();

  await openTab(laptop.page, /予算/);
  await laptop.page.getByText("貯金", { exact: true }).click();
  await afterSync(laptop.page, () => expect(laptop.page.getByText("E2E車").first()).toBeVisible());

  await laptop.context.setOffline(true);
  await expect(laptop.page.getByText("E2E車").first()).toBeVisible();
  await expect(laptop.page.getByRole("button", { name: /貯金目標を追加/ })).toBeDisabled();
});

test("a month's fixed expense is posted once when both devices sync", async ({ browser }) => {
  const [phone, laptop] = await openTwoDevices(browser, "posting");

  await openTab(phone.page, /予算/);
  await phone.page.getByText("定期支出", { exact: true }).click();
  await phone.page
    .getByRole("button", { name: /定期支出を追加/ })
    .first()
    .click();
  await phone.page.getByPlaceholder("家賃").fill("E2E保険");
  await phone.page.getByPlaceholder("25").fill("1");
  await phone.page.getByPlaceholder("80000").fill("5000");
  await phone.page.getByLabel("カテゴリ").selectOption({ label: "保険（損保）" });
  // Both devices sync as the expense is created: the first pull of each posts
  // the month, and the server keeps exactly one posting.
  await Promise.all([
    phone.page.getByRole("button", { name: "保存" }).click(),
    triggerSync(laptop.page),
  ]);
  await Promise.all([triggerSync(phone.page), triggerSync(laptop.page)]);

  for (const device of [phone, laptop]) {
    await openTab(device.page, /仕訳/);
    await afterSync(device.page, () => expect(journalRow(device.page, "E2E保険")).toBeVisible());
    await triggerSync(device.page);
    await expect(syncPill(device.page)).toHaveAccessibleName("同期状態: 同期済み");
    await expect(device.page.getByText("E2E保険", { exact: true })).toHaveCount(1);
  }
});
