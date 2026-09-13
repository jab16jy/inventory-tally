// apps/web/e2e/hoja-cierre.spec.ts — el cierre por backdrop de la Hoja, en un
// navegador de verdad. Los tests jsdom de `Hoja.test.tsx` no pueden ver esto:
// no hay layout, así que no existe "tocar el padding del diálogo".
//
// Reporte de campo: "agrupo 50 productos de $1.000 y se cierra la calculadora;
// para agrupar otra vez tengo que volver a entrar". Medido con
// diagnostico-hoja.spec.ts (temporal, ya borrado): un toque 14px bajo la
// tecla "Agrupar", o 6px a su derecha, cae con `e.target === dialog` — ese
// era exactamente el padding del <dialog>, que el arreglo movió a un wrapper
// interno (Hoja.tsx). El repro anterior tapeaba la tecla mientras estaba
// deshabilitada (display en 0) y Chromium ajustaba el toque al elemento
// habilitado más cercano, así que nunca alcanzaba el padding real — de ahí
// que ahora tecleamos "5" y "0" antes de medir.
//
// Corre en paralelo con flujo-conteo.spec.ts contra el MISMO emulador
// sembrado: usa "Contar $1.000", nunca la categoría $500 (flujo-conteo
// asierta "Tú: 12"/"Tú: 42" sobre ella).
import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test.describe("Hoja · cierre por backdrop (issue de campo)", () => {
  test("un toque cerca de Agrupar no cierra la hoja; uno sobre el backdrop real sí", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.addStyleTag({ content: ".firebase-emulator-warning { display: none !important; }" });
    await page.getByLabel("Correo").fill("ana@negocio.com");
    await page.getByLabel("Contraseña").fill("Temp2026#");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.getByRole("button", { name: /Sucursal Norte/ }).click();
    await page.getByLabel("Tu área").selectOption({ label: "General" });
    await page.getByRole("button", { name: "Empezar a contar" }).click();
    await page.getByRole("button", { name: "Contar $1.000" }).click();

    // `page.locator("dialog").first()` matchearía el modal de actualización
    // si estuviera presente, y `getByRole("dialog", { name })` sólo matchea
    // cuando el <dialog> está abierto — por eso el selector directo.
    const hoja = page.locator('dialog[aria-label^="Contar"]');
    await expect(hoja).toBeVisible();
    expect(await hoja.evaluate((d: HTMLDialogElement) => d.open)).toBe(true);

    await hoja.getByRole("button", { name: "5", exact: true }).click();
    await hoja.getByRole("button", { name: "0", exact: true }).click();
    await expect(hoja.getByTestId("hoja-valor")).toHaveText("50");

    const agrupar = hoja.getByRole("button", { name: "Agrupar", exact: true });
    const cajaAgrupar = (await agrupar.boundingBox())!;
    const cajaHoja = (await hoja.boundingBox())!;

    // 14px bajo la tecla "Agrupar": franja del padding inferior del <dialog>
    // (p-4 + safe-area), superficie visible de la calculadora.
    await page.touchscreen.tap(
      cajaAgrupar.x + cajaAgrupar.width / 2,
      cajaAgrupar.y + cajaAgrupar.height + 14,
    );
    expect(await hoja.evaluate((d: HTMLDialogElement) => d.open)).toBe(true);

    // Margen izquierdo de la hoja, a la altura de la fila de Agrupar: mismo
    // padding lateral que el reporte de campo original ("o el margen
    // izquierdo"), pero lejos de cualquier tecla — Agrupar queda en la
    // esquina INFERIOR DERECHA de la grilla — para no depender de que
    // Chromium ajuste un toque ambiguo hacia el control clicable más
    // cercano. Desde que Agrupar cierra la Hoja (pedido de campo), un toque
    // que sí llegara a activarla haría fallar esta aserción por una razón
    // correcta (agrupó de verdad), no por el bug de backdrop que este test
    // cubre — de ahí que el punto de sondeo se aleje del botón.
    await page.touchscreen.tap(cajaHoja.x + 6, cajaAgrupar.y + cajaAgrupar.height / 2);
    expect(await hoja.evaluate((d: HTMLDialogElement) => d.open)).toBe(true);
    await expect(hoja.getByTestId("hoja-valor")).toHaveText("50");

    // Y el cierre por backdrop de verdad —tocar claramente por encima de la
    // hoja— sigue funcionando: el arreglo no lo puede sacrificar.
    await page.touchscreen.tap(195, cajaHoja.y - 40);
    expect(await hoja.evaluate((d: HTMLDialogElement) => d.open)).toBe(false);
  });
});
