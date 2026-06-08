import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Evaluated at Node.js build time so the RegExp is serialized as a literal
// into sw.js — avoids "process is not defined" in the service worker.
const api_origin = process.env.VITE_API_URL ?? "http://localhost:8080";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        runtimeCaching: [
          {
            urlPattern: new RegExp(`^${api_origin}/(journal-entries|budgets|expenses)`),
            handler: "NetworkFirst",
          },
          {
            urlPattern: new RegExp(`^${api_origin}/(category-groups|expense-categories|statement-types)`),
            handler: "CacheFirst",
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
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    env: {
      VITE_API_URL: "http://localhost:8080",
    },
  },
});
