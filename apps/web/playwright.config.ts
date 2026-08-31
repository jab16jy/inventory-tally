// apps/web/playwright.config.ts — E2E contra el Emulator Suite (auth +
// firestore, ver `test:e2e` en package.json). Un solo proyecto Desktop
// Chrome: los locators son por rol/aria-label, no por layout, así que un
// segundo proyecto "mobile" no prueba nada distinto — el viewport móvil se
// fija en el propio spec del cajero (flujo mobile-first) donde importa.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://localhost:5173" },
  reporter: process.env.CI ? "line" : "html",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    env: { VITE_USE_EMULATORS: "true" },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
