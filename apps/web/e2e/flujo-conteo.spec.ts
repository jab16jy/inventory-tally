// apps/web/e2e/flujo-conteo.spec.ts — recorrido E2E del cajero contra el
// Emulator Suite (auth + firestore), sembrado por `npm run test:e2e` en la
// raíz. Usa la sesión fija `sesion_e2e_norte` que `tools/seed.ts` siembra en
// `suc_norte` (ver `sembrarSesionAbierta`).
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("flujo de conteo del cajero", () => {
  test("inicia sesión, cuenta una categoría y finaliza el conteo", async ({ page }) => {
    await page.goto("/login");
    // El SDK de Firebase inyecta un banner fijo "Running in emulator mode" al
    // conectar contra el emulador de Auth — intercepta los clics sobre el
    // Deck (sticky al fondo, mismo borde inferior). No es parte de la app:
    // se oculta por CSS. `addStyleTag` (no `addInitScript`): esta app es una
    // SPA con `BrowserRouter` — todo lo que sigue navega por `pushState`, así
    // que el estilo inyectado aquí, una sola vez tras la única recarga real
    // de documento, sobrevive el resto del recorrido.
    await page.addStyleTag({ content: ".firebase-emulator-warning { display: none !important; }" });
    await page.getByLabel("Correo").fill("ana@negocio.com");
    await page.getByLabel("Contraseña").fill("Temp2026#");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page).toHaveURL(/\/sucursales$/);
    // SucursalesScreen.tsx: el nombre accesible del botón es el nombre de la
    // sucursal + el estado ("Continuar →" cuando hay sesión abierta) — match
    // parcial porque el estado va en un <span> hermano dentro del mismo botón.
    await page.getByRole("button", { name: /Sucursal Norte/ }).click();

    await expect(page).toHaveURL(/\/conteo\/.+\/preparar$/);
    await page.getByRole("button", { name: "Empezar a contar" }).click();

    await expect(page).toHaveURL(/\/conteo\/[^/]+$/);
    // FilaCategoria.tsx: tocar la fila (aria-label "Contar $500") abre la
    // Hoja — mismo texto de aria-label que el <dialog>, pero el rol distingue.
    await page.getByRole("button", { name: "Contar $500" }).click();

    const hoja = page.getByRole("dialog", { name: "Contar $500" });
    await expect(hoja).toBeVisible();

    // Primer dígito reemplaza el valor precargado (Hoja.tsx: `tocado`).
    await hoja.getByRole("button", { name: "1" }).click();
    await hoja.getByRole("button", { name: "2" }).click();
    await expect(hoja.getByTestId("hoja-valor")).toHaveText("12");

    await hoja.getByRole("button", { name: "Guardar" }).click();
    // `siguientePendiente` avanza sola a la siguiente categoría pendiente, así
    // que la Hoja sigue abierta (ahora sobre $1.000) en vez de cerrarse sola.
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Volver" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Finalizar conteo" }).click();

    await expect(page).toHaveURL(/\/conteo\/.+\/finalizar$/);
    await expect(page.getByText("Todo enviado")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y salir" }).click();

    await expect(page).toHaveURL(/\/sucursales$/);
  });
});
