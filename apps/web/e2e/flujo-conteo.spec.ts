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
    // ADR-23/D-1 (docs/diseno/etapa-3-ui.md): área activa obligatoria — el
    // ticket #84 lo rompe porque "Empezar a contar" queda deshabilitado
    // hasta elegir una. `tools/seed.ts` siembra una sola área ("General").
    await page.getByLabel("Tu área").selectOption({ label: "General" });
    await page.getByRole("button", { name: "Empezar a contar" }).click();

    await expect(page).toHaveURL(/\/conteo\/[^/]+$/);
    // FilaCategoria.tsx: tocar la fila (aria-label "Contar $500") abre la
    // Hoja — mismo texto de aria-label que el <dialog>, pero el rol distingue.
    await page.getByRole("button", { name: "Contar $500" }).click();

    const hoja = page.getByRole("dialog", { name: "Contar $500" });
    await expect(hoja).toBeVisible();

    // El display arranca en "0" (ADR-24): ya no precarga el aporte previo —
    // lo ya contado se lee aparte, en la línea "Tu conteo: N". `exact: true`
    // en todos los dígitos de aquí en más porque la papelera de tandas mete
    // botones como "Borrar tanda de 12", y el match de nombre accesible de
    // Playwright es por subcadena por defecto: "1" sin `exact` matchearía
    // también ese botón en cuanto la tanda de 12 quede listada.
    await hoja.getByRole("button", { name: "1", exact: true }).click();
    await hoja.getByRole("button", { name: "2", exact: true }).click();
    await expect(hoja.getByTestId("hoja-valor")).toHaveText("12");

    // Agrupar CIERRA la Hoja (pedido de campo, revierte el punto de cierre
    // de ADR-24): para otra tanda de la misma categoría el cajero vuelve a
    // tocar la fila. El ledger `partidas` sigue acumulando igual que antes.
    await hoja.getByRole("button", { name: "Agrupar", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Tú: 12")).toBeVisible();

    // Segunda tanda en la MISMA categoría: hay que reabrirla. Contra las
    // reglas de Firestore reales (no el fake de los tests unitarios), la
    // fila debe mostrar la SUMA, 12 + 30 = 42.
    await page.getByRole("button", { name: "Contar $500" }).click();
    const hoja2 = page.getByRole("dialog", { name: "Contar $500" });
    await expect(hoja2).toBeVisible();
    await expect(hoja2.getByText("Tu conteo: 12")).toBeVisible();

    await hoja2.getByRole("button", { name: "3", exact: true }).click();
    await hoja2.getByRole("button", { name: "0", exact: true }).click();
    await hoja2.getByRole("button", { name: "Agrupar", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("Tú: 42")).toBeVisible();

    // Borrar la tanda de 12 desde la papelera, con su confirmación "Sí,
    // borrar": la fila baja a 30, la cantidad de la tanda que queda. Borrar
    // una tanda NO cierra la Hoja (a diferencia de agrupar).
    await page.getByRole("button", { name: "Contar $500" }).click();
    const hoja3 = page.getByRole("dialog", { name: "Contar $500" });
    await hoja3.getByRole("button", { name: "Borrar tanda de 12", exact: true }).click();
    await hoja3.getByRole("button", { name: "Sí, borrar", exact: true }).click();
    await expect(page.getByText("Tú: 30")).toBeVisible();
    await expect(hoja3).toBeVisible();

    await page.getByRole("button", { name: "Volver" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.getByRole("button", { name: "Finalizar conteo" }).click();

    await expect(page).toHaveURL(/\/conteo\/.+\/finalizar$/);
    await expect(page.getByText("Todo enviado")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y salir" }).click();

    await expect(page).toHaveURL(/\/sucursales$/);
  });
});
