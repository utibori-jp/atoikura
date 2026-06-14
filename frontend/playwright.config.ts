import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  reporter: [["list"], ["html", { outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
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
        JWT_SECRET:
          process.env.JWT_SECRET ?? "dev-jwt-secret-change-in-production",
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
