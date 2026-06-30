/**
 * Visual regression baseline tests — Step 0 (#167)
 *
 * Captures screenshot snapshots of every navigable screen in both a mobile
 * (390×844, ≤1023px → MobileX components) and a web (1280×800, ≥1024px →
 * WebX components) viewport BEFORE Tailwind is introduced, establishing the
 * pre-migration baseline.
 *
 * Seeded data (see e2e/helpers/seed.ts):
 *   - base income: ¥300,000
 *   - 1 recurring expense (fixed): 家賃 ¥80,000
 *   - 1 savings goal: 旅行積立 ¥20,000/month
 *   - 1 income record: ¥280,000 給与 (current month, day 15)
 *   - NO journal entries → home shows ¥0 spending (stable ring)
 *
 * variable_budget = ¥300,000 − ¥80,000 − ¥20,000 = ¥200,000 (stable).
 *
 * Masked volatile regions (per screen):
 *   - All SVG elements inside <main>: chart today-marker moves daily
 *   - "あとX日" / "残りX日": days-remaining changes daily
 *   - Date labels (YYYY年MM月, MM月DD日): change month-to-month / daily
 *   - 1日あたり stats: depend on remaining days in month
 *   - Income record transaction dates: change each month
 *   - User account card: email, ID, last-login are run-specific
 */

import { test, expect, type Page } from "@playwright/test";
import { seedUser, type SeedResult } from "./helpers/seed";
import { blockFonts, freezeClock, injectToken, openApp } from "./helpers/auth";

// ── Shared seed data (created once per project run, reused across tests) ──

let sharedSeed: SeedResult;

test.beforeAll(async ({ request }) => {
  sharedSeed = await seedUser(request);
});

// ── Navigation helpers ─────────────────────────────────────────────────────

function isMobileViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

/**
 * Navigate to a top-level tab.
 * On mobile: click the bottom tab bar button.
 * On web: click the header nav button.
 */
async function goToTab(
  page: Page,
  tab: "home" | "list" | "review" | "budget" | "master"
): Promise<void> {
  const LABEL_MAP: Record<string, string> = {
    home: "ホーム",
    list: "仕訳",
    review: "振り返り",
    budget: "予算",
    master: "マスタ",
  };
  await page.getByRole("button", { name: LABEL_MAP[tab] }).first().click();
}

/**
 * Navigate to a budget sub-screen by clicking the respective tile/card.
 *
 * Mobile (MobileBudget): tiles are rendered as <button> elements.
 * Web (WebBudget): tiles are rendered as clickable <div> elements.
 * We click by the tile title text which is unique in both cases.
 */
async function goToBudgetSub(page: Page, sub: "income" | "recurring" | "savings"): Promise<void> {
  const LABEL_MAP: Record<string, string> = {
    income: "基準収入",
    recurring: "定期支出",
    savings: "貯金",
  };
  const label = LABEL_MAP[sub];
  if (isMobileViewport(page)) {
    // Mobile: the tiles are <button> elements whose text includes the title
    await page.getByRole("button", { name: label }).first().click();
  } else {
    // Web: the tiles are <div> elements; click the div whose visible text is
    // exactly the tile title (the formula row contains "基準収入 ¥X" with extra
    // text so the exact-match locator correctly targets the tile heading only).
    await page.getByText(label, { exact: true }).first().click();
  }
}

// ── Mask helpers ───────────────────────────────────────────────────────────

/**
 * Locators for volatile content on the Home screen.
 * Masking: all SVGs in <main> (chart today-marker and ring arc),
 * elements containing "あとX日" (days remaining), and on web the date label
 * and stat-pill sub-texts that depend on today or days-left.
 */
function homeMasks(page: Page) {
  const masks = [
    // All chart/ring SVGs inside the main content area
    page.locator("main svg"),
    // "あとXX日" text (volatile: today_day changes daily)
    page
      .locator("div")
      .filter({ hasText: /あと\d+日/ })
      .last(),
  ];

  if (!isMobileViewport(page)) {
    // WebHome: today's formatted date "X月Y日（曜日）" at top of donut card
    masks.push(
      page
        .locator("div")
        .filter({ hasText: /^\d{1,2}月\d{1,2}日（.）$/ })
        .first()
    );
    // "今日まで" stat pill sub-text: "基準より ¥X 余裕/オーバー" (depends on today)
    masks.push(
      page
        .locator("div")
        .filter({ hasText: /^今日まで$/ })
        .locator("xpath=parent::div")
    );
    // "1日あたり" stat pill sub-text: "残り X 日 × ¥Y" (depends on days_left)
    masks.push(
      page
        .locator("div")
        .filter({ hasText: /^1日あたり$/ })
        .locator("xpath=parent::div")
    );
  } else {
    // MobileHome: "1日 ¥X" mini-stat (daily_left depends on days_left)
    masks.push(page.locator("div").filter({ hasText: /^1日$/ }).locator("xpath=parent::div"));
  }

  return masks;
}

/**
 * Month-year label (YYYY年MM月) in the journal and review navigation.
 * Rendered as a <span> in both mobile and web contexts.
 */
function monthLabelMasks(page: Page) {
  return [page.locator("span").filter({ hasText: /^\d{4}年\d{1,2}月$/ })];
}

/**
 * Individual date headers inside the journal list (e.g. "6月10日（水）").
 * Not needed when no journal entries are seeded, but included defensively.
 */
function journalDateHeaderMasks(page: Page) {
  return [page.locator("div").filter({ hasText: /^\d{1,2}月\d{1,2}日（.）$/ })];
}

/**
 * Budget hub: daily_budget and days_remaining section (both volatile).
 * The containing element has both "1日あたり" and "今月の残り" labels.
 */
function budgetHubMasks(page: Page) {
  return [
    page
      .locator("div")
      .filter({ hasText: /1日あたり/ })
      .filter({ hasText: /今月の残り/ })
      .last(),
  ];
}

/**
 * Income record date label "M月D日（曜）" displayed in the income list.
 */
function incomeRecordDateMasks(page: Page) {
  return [page.locator("div").filter({ hasText: /^\d{1,2}月\d{1,2}日（.）$/ })];
}

/**
 * Account screen: every piece of content is run-specific (email, ID,
 * display name, last-login timestamp, avatar initial).  Mask the entire
 * main content area so the test only validates that the screen loads without
 * error; the navigation chrome is exercised by other tests.
 */
function accountCardMasks(page: Page) {
  return [page.locator("main")];
}

// ── Screenshot options ─────────────────────────────────────────────────────

const SHOT_OPTS = {
  animations: "disabled" as const,
  fullPage: true,
} as const;

// ── Test setup: shared page initialization ─────────────────────────────────

async function authPage(page: Page): Promise<void> {
  await blockFonts(page);
  await freezeClock(page);
  await injectToken(page, sharedSeed.token);
  await openApp(page);
}

// ── Screens ────────────────────────────────────────────────────────────────

test("home screen", async ({ page }) => {
  await authPage(page);
  // Home is the default landing tab — no navigation click needed.
  await page.waitForTimeout(600); // allow chart data to settle
  await expect(page).toHaveScreenshot("home.png", {
    ...SHOT_OPTS,
    mask: homeMasks(page),
  });
});

test("journal (list) screen", async ({ page }) => {
  await authPage(page);
  await goToTab(page, "list");
  // Wait for the journal list to render (empty state or entries)
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("journal.png", {
    ...SHOT_OPTS,
    mask: [...monthLabelMasks(page), ...journalDateHeaderMasks(page)],
  });
});

test("review screen", async ({ page }) => {
  await authPage(page);
  await goToTab(page, "review");
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("review.png", {
    ...SHOT_OPTS,
    mask: monthLabelMasks(page),
  });
});

test("budget hub screen", async ({ page }) => {
  await authPage(page);
  await goToTab(page, "budget");
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("budget-hub.png", {
    ...SHOT_OPTS,
    mask: budgetHubMasks(page),
  });
});

test("budget > income screen", async ({ page }) => {
  await authPage(page);
  await goToTab(page, "budget");
  await goToBudgetSub(page, "income");
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("budget-income.png", {
    ...SHOT_OPTS,
    mask: [...monthLabelMasks(page), ...incomeRecordDateMasks(page)],
  });
});

test("budget > recurring screen", async ({ page }) => {
  await authPage(page);
  await goToTab(page, "budget");
  await goToBudgetSub(page, "recurring");
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("budget-recurring.png", {
    ...SHOT_OPTS,
    // Billing-day numbers are static seeds; no volatile date masking needed.
  });
});

test("budget > savings screen", async ({ page }) => {
  await authPage(page);
  await goToTab(page, "budget");
  await goToBudgetSub(page, "savings");
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("budget-savings.png", {
    ...SHOT_OPTS,
  });
});

// Web-only screens ────────────────────────────────────────────────────────

test("master screen (web only)", async ({ page }) => {
  test.skip(isMobileViewport(page), "Master tab is web-only");
  await authPage(page);
  await goToTab(page, "master");
  await page.waitForTimeout(400);
  await expect(page).toHaveScreenshot("master.png", {
    ...SHOT_OPTS,
  });
});

// Mobile entry form (modal) ────────────────────────────────────────────────

test("entry form (mobile only)", async ({ page }) => {
  test.skip(!isMobileViewport(page), "Entry form modal is mobile-only in this test");
  await authPage(page);
  // The floating + button in the mobile tab bar opens the entry sheet.
  await page.getByRole("button", { name: "＋" }).click();
  // Wait for the modal / bottom-sheet to fully render.
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot("entry-form-mobile.png", {
    ...SHOT_OPTS,
    // Mask the date field — it defaults to today.
    mask: [page.locator("input[type='date']")],
  });
});

// Account screen ──────────────────────────────────────────────────────────

test("account screen (web only)", async ({ page }) => {
  test.skip(isMobileViewport(page), "Account nav is web-only (via user pill)");
  await authPage(page);
  // Click the user-pill button in the web header (title="アカウント").
  await page.getByTitle("アカウント").click();
  await page.waitForTimeout(300);
  await expect(page).toHaveScreenshot("account.png", {
    ...SHOT_OPTS,
    mask: accountCardMasks(page),
  });
});
