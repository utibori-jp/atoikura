import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { apiOriginOf, securityHeaders } from "./securityHeaders";

// The "demo" mode produces the static, MSW-backed GitHub Pages build (#142):
// it is served from a project-site subpath and must NOT register the PWA service
// worker, which would otherwise collide with MSW's own worker. The PWA plugin
// stays in the demo build disabled, so the update prompt's virtual module resolves.
export default defineConfig(({ mode }) => {
  const is_demo = mode === "demo";

  return {
    base: is_demo ? "/atoikura/" : "/",
    // Demo build runs fully client-side against MSW. These non-secret values are
    // injected here (rather than a committed .env file, which .gitignore excludes)
    // so the whole demo wiring lives in one place. VITE_API_URL is a base MSW
    // matches on; the origin is never actually reached.
    ...(is_demo
      ? {
          define: {
            "import.meta.env.VITE_DEMO": JSON.stringify("true"),
            "import.meta.env.VITE_API_URL": JSON.stringify("https://demo.atoikura.app"),
          },
        }
      : {}),
    plugins: [
      react(),
      VitePWA({
        disable: is_demo,
        // A new version waits until the user accepts the update prompt (or every
        // tab is closed), so an open session never runs against a mix of old and
        // new files (#202).
        registerType: "prompt",
        injectRegister: false,
        workbox: {
          // The app shell, including the SQLite WASM, so a cold start works offline.
          globPatterns: ["**/*.{js,css,html,wasm}"],
          // MSW's worker sits in public/ for the demo build only.
          globIgnores: ["mockServiceWorker.js"],
          cleanupOutdatedCaches: true,
          // API responses are never cached: the data lives in the local database.
          // Only the web fonts are, so the app looks the same offline.
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
              handler: "StaleWhileRevalidate",
              options: { cacheName: "google-fonts-stylesheets" },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/,
              handler: "CacheFirst",
              options: {
                cacheName: "google-fonts-webfonts",
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        },
        manifest: {
          name: "atoikura",
          short_name: "atoikura",
          theme_color: "#ffffff",
          display: "standalone",
          icons: [
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        },
      }),
    ],
    server: {
      port: 3000,
    },
    // The production build under the production security headers (#208), as
    // nginx.conf.template sends them; the E2E suite checks for CSP violations here.
    preview: {
      headers: securityHeaders(apiOriginOf(loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL)),
    },
    // SQLite WASM (local-first DB, #199) locates sqlite3.wasm relative to its own
    // module, which breaks if Vite pre-bundles it. The DB runs in a module worker.
    optimizeDeps: {
      exclude: ["@sqlite.org/sqlite-wasm"],
    },
    worker: {
      format: "es",
    },
    test: {
      environment: "jsdom",
      globals: true,
      // Scope to unit tests under src/ so the Playwright e2e specs (e2e/*.spec.ts),
      // which use Playwright's own runner, are not picked up by Vitest.
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      setupFiles: ["./src/test/setup.ts"],
      env: {
        VITE_API_URL: "http://localhost:8080",
      },
    },
  };
});
