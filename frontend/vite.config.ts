import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Evaluated at Node.js build time so the RegExp is serialized as a literal
// into sw.js — avoids "process is not defined" in the service worker.
const api_origin = process.env.VITE_API_URL ?? "http://localhost:8080";

// The "demo" mode produces the static, MSW-backed GitHub Pages build (#142):
// it is served from a project-site subpath and must NOT register the PWA service
// worker, which would otherwise collide with MSW's own worker.
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
      ...(is_demo
        ? []
        : [
            VitePWA({
              registerType: "autoUpdate",
              workbox: {
                runtimeCaching: [
                  {
                    urlPattern: new RegExp(`^${api_origin}/(journal-entries|budgets|expenses)`),
                    handler: "NetworkFirst",
                  },
                  {
                    // These master endpoints are per-user (every row has a user_id). CacheFirst
                    // never revalidates, so after an account switch the service worker would serve
                    // the previous user's category ids — submitting one then fails backend
                    // validation ("category_id does not exist or is deleted"). NetworkFirst keeps
                    // them fresh online and only falls back to cache when offline.
                    urlPattern: new RegExp(
                      `^${api_origin}/(category-groups|expense-categories|statement-types)`
                    ),
                    handler: "NetworkFirst",
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
          ]),
    ],
    server: {
      port: 3000,
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
