// apps/web/e2e/panel-admin.spec.ts — panel del administrador contra el
// Emulator Suite (auth + firestore). Sólo lecturas: deliberadamente NO se
// toca ningún botón que dispare `httpsCallable` (abrir/cerrar sesión,
// gestionar cajeros) — este suite excluye a propósito el emulador de
// Functions (ver `test:e2e` en la raíz, sólo `--only auth,firestore`).
import { expect, test } from "@playwright/test";

test.describe("panel del administrador", () => {
  test("muestra la sesión abierta sembrada en Sucursal Norte", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Correo").fill("admin@negocio.com");
    await page.getByLabel("Contraseña").fill("Temp2026#");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { name: "Sesiones abiertas" })).toBeVisible();

    // PanelScreen.tsx: aria-label `Análisis — ${sesion.sucursalNombre}` en el
    // botón de análisis de la fila — evidencia de que la sesión sembrada
    // (sesion_e2e_norte, suc_norte) llegó al listener del admin.
    await expect(page.getByRole("button", { name: "Análisis — Sucursal Norte" })).toBeVisible();
  });
});
