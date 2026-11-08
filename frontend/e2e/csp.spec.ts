import { test, expect, type Page } from "@playwright/test";

// The production build under its Content-Security-Policy (#208): normal use
// raises no violation. vite preview sends the same headers as nginx in
// production (securityHeaders.ts).

const PASSWORD = "E2Epassword1";

// Collects CSP violations in the page, and the console errors browsers log for
// them (also from workers, whose events don't reach the page).
async function watchViolations(page: Page): Promise<string[]> {
  const violations: string[] = [];
  page.on("console", (console_message) => {
    if (/Content Security Policy/i.test(console_message.text())) {
      violations.push(console_message.text());
    }
  });
  await page.exposeFunction("reportCspViolation", (violation_text: string) => {
    violations.push(violation_text);
  });
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (violation_event) => {
      const report = (window as unknown as { reportCspViolation: (text: string) => void })
        .reportCspViolation;
      report(`${violation_event.violatedDirective} ${violation_event.blockedURI}`);
    });
  });
  return violations;
}

test("the app runs under its CSP without violations", async ({ page }) => {
  const violations = await watchViolations(page);
  // See happy-path.spec.ts: web fonts are blocked in the devcontainer.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort());

  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toContain(
    "script-src 'self' 'wasm-unsafe-eval'"
  );
  expect(response?.headers()["x-frame-options"]).toBe("DENY");

  await page.getByText("新規登録").click();
  const unique_suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.locator("#auth-email").fill(`e2e-csp-${unique_suffix}@example.com`);
  await page.locator("#auth-password").fill(PASSWORD);
  await page.getByRole("button", { name: "アカウント作成" }).click();
  // Syncing means the DB worker compiled SQLite WASM and the API was reachable.
  await expect(page.getByRole("button", { name: /^同期状態: 同期済み/ }).first()).toBeVisible();

  // Record an expense (local DB write and push).
  await page.getByRole("button", { name: /食費/ }).first().click();
  await page.getByRole("button", { name: "スーパー・自炊" }).click();
  await page.getByPlaceholder("0").fill("640");
  await page.getByPlaceholder("例：唐揚げ定食").fill("E2E CSPランチ");
  await page.getByText("＋ 記録する").click();

  // Every main screen, including an online edit.
  await page.getByRole("button", { name: /仕訳/ }).first().click();
  await expect(page.getByText("E2E CSPランチ", { exact: true })).toBeVisible();
  // The month's CSV is saved from the local copy through a blob URL.
  const [csv_download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "⬇ CSV" }).click(),
  ]);
  expect(csv_download.suggestedFilename()).toMatch(/^atoikura-journal-\d{4}-\d{2}\.csv$/);
  const csv_chunks: Buffer[] = [];
  for await (const csv_chunk of await csv_download.createReadStream()) csv_chunks.push(csv_chunk);
  expect(Buffer.concat(csv_chunks).toString("utf8")).toContain(",E2E CSPランチ,640,");
  await page.getByRole("button", { name: /予算/ }).first().click();
  await expect(page.getByText("今月の予算プラン")).toBeVisible();
  await page.getByText("毎月の見込み収入").click();
  await expect(page.getByRole("button", { name: /収入を記録/ })).toBeVisible();
  await page
    .getByRole("button", { name: /振り返り/ })
    .first()
    .click();
  await page
    .getByRole("button", { name: /マスタ/ })
    .first()
    .click();
  await page.getByTitle("アカウント").first().click();
  await page.getByLabel("家計の名前").fill("E2E CSP家計");
  await page.getByRole("button", { name: "作成" }).click();
  await expect(page.getByText("E2E CSP家計")).toBeVisible();
  await page.getByRole("button", { name: "招待を作成" }).click();
  await expect(page.getByTestId("invitation-code")).toBeVisible();

  expect(violations).toEqual([]);
});
