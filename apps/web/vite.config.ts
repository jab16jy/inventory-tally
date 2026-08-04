// apps/web/vite.config.ts (doc 06 §4)
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // `packages/data` importa `@conteo/shared` por submódulo (evita el
      // barrel, que arrastra config/entorno.ts y su ambient ImportMeta.env
      // de Vite). Vite no lee "paths" de tsconfig.base.json, así que este
      // alias replica ese mismo mapeo también en apps/web.
      {
        find: /^@conteo\/shared\/(.*)$/,
        replacement: fileURLToPath(new URL("../../packages/shared/src/$1", import.meta.url)),
      },
    ],
  },
  plugins: [
    react(),
    // Tailwind v4 sólo necesita este plugin y `@import "tailwindcss"`: sin
    // PostCSS, sin autoprefixer, sin tailwind.config.js (doc de v4).
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // El bootstrap (index.html) nunca se cachea agresivamente; los
        // assets con hash sí, porque son inmutables por versión (doc 06 §4).
        navigateFallback: "/index.html",
        runtimeCaching: [],
      },
      manifest: {
        name: "Conteo de Inventario",
        short_name: "Conteo",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0F1115",
        theme_color: "#0F1115",
        start_url: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
