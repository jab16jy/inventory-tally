// apps/web/vite.config.ts (doc 06 §4)
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { configDefaults, defineConfig } from "vitest/config";

// issue #12 (D1/D7, corregido en RDD — R4-001): versión actual = tag de git
// exacto sobre HEAD, sin prefijo "v". `--always` hace que sin tags (caso
// real hoy: `git tag -l` vacío, o CI con checkout superficial que no trae
// tags) devuelva el hash corto en vez de fallar; un tag con sufijo "-N-hash"
// (commits después del tag) o "-dirty" tampoco matchea el regex. Sin tag
// exacto la versión es DESCONOCIDA (`null`), no un sentinel numérico: un
// "0.0.0" comparable se trataba como versión real siempre-desactualizada y
// bloqueaba a todos los usuarios apenas alguien fijara un `versionMinima`
// real, sin salida (hallazgo R4-001 del review-resilience).
function versionDeBuild(): string | null {
  try {
    const salida = execSync("git describe --tags --always").toString().trim();
    return /^v\d+\.\d+\.\d+$/.test(salida) ? salida.slice(1) : null;
  } catch {
    return null;
  }
}

export default defineConfig({
  define: {
    __VERSION_APP__: JSON.stringify(versionDeBuild()),
  },
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
      // "autoUpdate" recarga el service worker (y la pestaña) SOLO, sin
      // avisar — puede recargarle la app al cajero a mitad de conteo y
      // perderle lo que no se ha sincronizado (RNF-12). "prompt" deja el SW
      // nuevo en `waiting` hasta que ModalActualizacionDisponible.tsx lo
      // active a petición del cajero (plan §5, estado 6).
      registerType: "prompt",
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
    // e2e/ son specs de Playwright (test.describe propio, distinto del
    // global de vitest) — sin esto, vitest los recoge también por el glob
    // *.spec.ts por defecto y choca con el runner de Playwright.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
