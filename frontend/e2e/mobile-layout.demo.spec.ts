import { test, expect, type Page } from "@playwright/test";

// Mobile layout checks on the demo build (no backend). The viewport mirrors an
// iPhone 13 but stays on Chromium, which is the only browser in the devcontainer.
// Chromium has no collapsing toolbar, so real-device checks are still needed for
// that part; these tests guard the layout rules the fix relies on.
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});

const TAB_LABELS = ["ホーム", "振り返り", "仕訳", "予算"];

function mobileTabBar(page: Page) {
  return page.getByRole("navigation", { name: "メインメニュー" });
}

async function blockWebFonts(page: Page) {
  // See happy-path.spec.ts: web fonts are blocked in the devcontainer.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

async function expectTabBarFullyOnScreen(page: Page, screen_label: string) {
  const viewport_size = page.viewportSize();
  if (!viewport_size) throw new Error("viewport size is not set");
  const tab_bar_box = await mobileTabBar(page).boundingBox();
  if (!tab_bar_box) throw new Error(`tab bar is not rendered on ${screen_label}`);
  expect(tab_bar_box.y, `tab bar top on ${screen_label}`).toBeGreaterThanOrEqual(0);
  expect(tab_bar_box.y + tab_bar_box.height, `tab bar bottom on ${screen_label}`).toBeLessThanOrEqual(
    viewport_size.height + 0.5,
  );
}

test("the mobile tab bar stays on screen and clears the content of long screens", async ({ page }) => {
  await blockWebFonts(page);
  await page.goto("./");
  await expect(mobileTabBar(page)).toBeVisible();

  let scrollable_screen_count = 0;
  for (const tab_label of TAB_LABELS) {
    await mobileTabBar(page).getByRole("button", { name: tab_label }).click();
    await page.waitForLoadState("networkidle");

    // The screen content scrolls inside <main>, not the document.
    const is_scrollable = await page
      .locator("main")
      .evaluate((main_element) => main_element.scrollHeight > main_element.clientHeight);
    if (is_scrollable) scrollable_screen_count += 1;

    await page.locator("main").evaluate((main_element) => {
      main_element.scrollTop = main_element.scrollHeight;
    });
    await expectTabBarFullyOnScreen(page, `${tab_label} (scrolled to bottom)`);

    // Scrolled all the way down, the last content sits above the tab bar.
    const content_bottom_y = await page.locator("main").evaluate((main_element) => {
      const last_content_element = main_element.lastElementChild;
      return last_content_element ? last_content_element.getBoundingClientRect().bottom : 0;
    });
    const tab_bar_box = await mobileTabBar(page).boundingBox();
    expect(content_bottom_y, `content bottom on ${tab_label}`).toBeLessThanOrEqual(
      (tab_bar_box?.y ?? 0) + 0.5,
    );

    await page.locator("main").evaluate((main_element) => {
      main_element.scrollTop = 0;
    });
    await expectTabBarFullyOnScreen(page, `${tab_label} (top)`);
  }
  // Guard against a vacuous pass: at least one screen must be taller than the viewport.
  expect(scrollable_screen_count).toBeGreaterThan(0);
});

test("page zoom is disabled so the tab bar cannot be zoomed off screen", async ({ page }) => {
  await blockWebFonts(page);
  await page.goto("./");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
    "content",
    /maximum-scale=1(\.0)?/,
  );
  const tab_bar_touch_action = await mobileTabBar(page).evaluate(
    (element) => getComputedStyle(element).touchAction,
  );
  expect(tab_bar_touch_action).toBe("pan-x pan-y");
  const main_touch_action = await page
    .locator("main")
    .evaluate((element) => getComputedStyle(element).touchAction);
  expect(main_touch_action).toBe("pan-x pan-y");
});
