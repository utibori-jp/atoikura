import { test, expect, type Page } from "@playwright/test";

// The opfs-sahpool VFS keeps a pool of files; each starts with a 4 KiB header,
// and a file holding a database grows past it.
const SAHPOOL_HEADER_BYTES = 4096;

async function listOpfsFileSizes(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const file_sizes: number[] = [];
    async function collectFileSizes(directory_handle: FileSystemDirectoryHandle) {
      // @ts-expect-error entries() is missing from the DOM typings
      for await (const [, entry_handle] of directory_handle.entries()) {
        if (entry_handle.kind === "directory") await collectFileSizes(entry_handle);
        else file_sizes.push((await entry_handle.getFile()).size);
      }
    }
    await collectFileSizes(await navigator.storage.getDirectory());
    return file_sizes;
  });
}

test("logout deletes the local database from the device", async ({ page }) => {
  // See happy-path.spec.ts: web fonts are blocked in the devcontainer.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());
  await page.goto("/");
  await page.getByText("新規登録").click();
  await page.locator("#auth-email").fill(`e2e-logout-${Date.now()}@example.com`);
  await page.locator("#auth-password").fill("E2Epassword1");
  await page.getByRole("button", { name: "アカウント作成" }).click();
  await expect(page.getByRole("button", { name: /同期状態: 同期済み/ }).first()).toBeVisible();
  const file_sizes_signed_in = await listOpfsFileSizes(page);

  await page.getByTitle("アカウント").first().click();
  await page.getByRole("button", { name: "ログアウト" }).click();
  await expect(page.locator("#auth-email")).toBeVisible();

  const file_sizes_signed_out = await listOpfsFileSizes(page);
  expect(Math.max(...file_sizes_signed_in)).toBeGreaterThan(SAHPOOL_HEADER_BYTES);
  expect(Math.max(...file_sizes_signed_out)).toBeLessThanOrEqual(SAHPOOL_HEADER_BYTES);
});
