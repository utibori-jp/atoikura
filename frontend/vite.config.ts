import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.origin === process.env.VITE_API_URL &&
              /\/(journal-entries|budgets|expenses)/.test(url.pathname),
            handler: "NetworkFirst",
          },
          {
            urlPattern: ({ url }) =>
              url.origin === process.env.VITE_API_URL &&
              /\/(category-groups|expense-categories|statement-types)/.test(url.pathname),
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
