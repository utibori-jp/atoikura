import { test, expect } from "@playwright/test";

// The production build's service worker (#202): the app shell is precached, so
// the app starts with no network, and nothing but the shell and fonts is cached.

test("the installed app shell starts offline and caches no API responses", async ({
  page,
  context,
}) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#auth-email")).toBeVisible();
  // The first service worker activates without taking over the open page; it
  // controls the page from the next load on.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("#auth-email")).toBeVisible();

  const cache_names = await page.evaluate(() => caches.keys());
  expect(cache_names.some((cache_name) => cache_name.startsWith("workbox-precache"))).toBe(true);
  expect(
    cache_names.filter(
      (cache_name) =>
        !cache_name.startsWith("workbox-precache") && !cache_name.startsWith("google-fonts")
    )
  ).toEqual([]);
});
