/**
 * Auth helpers for visual-regression tests.
 *
 * The frontend stores the JWT in sessionStorage under "atoikura.jwt_token".
 * page.addInitScript() runs BEFORE the page's own scripts, so when React
 * mounts and calls token_store.load() it finds the token and skips the login
 * screen.
 *
 * IMPORTANT: call injectToken() BEFORE page.goto() — addInitScript must be
 * registered before navigation to take effect.
 */

import type { Page } from "@playwright/test";
import { FIXED_NOW } from "./seed";

const TOKEN_KEY = "atoikura.jwt_token";

/** Abort Google Fonts requests that block React mounting in the devcontainer. */
export async function blockFonts(page: Page): Promise<void> {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
}

/**
 * Pin the browser clock to a fixed instant so every client-side `new Date()`
 * (current-month titles like "2026年6月の振り返り", weekday labels, month tabs)
 * renders deterministically regardless of the real calendar date. Must be
 * called BEFORE navigation. setFixedTime freezes Date.now()/new Date() while
 * leaving timers running, so React effects and (disabled) animations still
 * behave normally. Server-computed volatile values (days-remaining, daily
 * budget) are unaffected by this and remain masked in the spec.
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_NOW);
}

/** Inject the JWT token into sessionStorage before the page loads. */
export async function injectToken(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }: { key: string; value: string }) => {
      sessionStorage.setItem(key, value);
    },
    { key: TOKEN_KEY, value: token }
  );
}

/** Navigate to the app root and wait for the authenticated shell to render. */
export async function openApp(page: Page): Promise<void> {
  await page.goto("/");
  // Wait for the home tab navigation item to confirm the app shell rendered.
  await page.getByText("ホーム").first().waitFor({ state: "visible", timeout: 15000 });
}
