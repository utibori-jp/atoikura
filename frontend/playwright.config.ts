import { defineConfig, devices } from "@playwright/test";
import * as fs from "fs";

// The devcontainer bakes Chromium at image-build time. The revision installed
// in the image may differ from what the current @playwright/test package
// expects.  Probe both revision paths so the config works regardless of which
// Playwright version was active when the image was built.
function resolveChromiumExecutable(): string | undefined {
  const candidates = [
    // Revision expected by Playwright 1.61.x
    "/ms-playwright/chromium-1228/chrome-linux64/chrome",
    // Revision baked into the current devcontainer image
    "/ms-playwright/chromium-1223/chrome-linux64/chrome",
  ];
  return candidates.find((p) => fs.existsSync(p));
}

const CHROMIUM_EXECUTABLE = resolveChromiumExecutable();

export default defineConfig({
  testDir: "./e2e",
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    // ── Existing project: happy-path integration tests ───────────────────
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {},
      },
      testMatch: ["**/happy-path.spec.ts"],
    },

    // ── Visual-regression projects ───────────────────────────────────────
    // Mobile: 390×844 viewport → window.matchMedia("(max-width: 1023px)")
    // evaluates true → MobileX components render.
    {
      name: "vr-mobile",
      use: {
        ...devices["Pixel 5"],
        // Pixel 5 is 393×851; override to a round 390×844 to be explicit.
        viewport: { width: 390, height: 844 },
        launchOptions: CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {},
      },
      testMatch: ["**/visual-regression.spec.ts"],
    },
    // Web: 1280×800 viewport → matchMedia evaluates false → WebX components.
    {
      name: "vr-web",
      use: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        launchOptions: CHROMIUM_EXECUTABLE ? { executablePath: CHROMIUM_EXECUTABLE } : {},
      },
      testMatch: ["**/visual-regression.spec.ts"],
    },
  ],
  webServer: [
    {
      command: "make -C ../backend run",
      url: "http://localhost:8080/health",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      // The backend requires JWT_SECRET to boot (auth middleware). Provide a
      // fixed dev secret so the single `npm run test:e2e` command is self-
      // contained; mirrors docker-compose.yml's backend service.
      env: {
        JWT_SECRET: process.env.JWT_SECRET ?? "dev-jwt-secret-change-in-production",
      },
    },
    {
      command: "npm run dev",
      url: "http://localhost:3000",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
