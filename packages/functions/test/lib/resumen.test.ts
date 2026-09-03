// Pruebas contra el emulador de Firestore (spec resumen-sesion: "Recomputation
// produces correct totals"). `calcularResumen` es pura respecto a Firestore (no
// lee ni escribe), pero recibe `QueryDocumentSnapshot` reales — construirlos a
// mano no aporta nada que sembrar y consultar el emulador no dé ya, y evita
// mockear una API que no es nuestra (misma decisión que el resto del paquete).
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { calcularResumen } from "../../src/lib/resumen.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

async function sembrarLinea(
  sesionId: string,
  categoriaId: string,
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).set({
    categoriaId,
    valorUnitario: 5000,
    etiqueta: "$5.000",
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "uid_admin",
    ...overrides,
  });
}

/** Misma consulta que usará el cron (D-1 paso 2): sólo líneas con conteo. */
async function lineasConConteo(sesionId: string) {
  const snap = await db
    .collection(`sesiones/${sesionId}/lineas`)
    .where("cantidadTotal", ">", 0)
    .get();
  return snap.docs;
}

describe("calcularResumen", () => {
  it("totales coinciden con las lineas sembradas (calculadora.ts)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarLinea(sesionId, "cat_5000", {
      cantidadTotal: 55,
      valorUnitario: 5000,
      etiqueta: "$5.000",
    });
    await sembrarLinea(sesionId, "cat_2000", {
      cantidadTotal: 310,
      valorUnitario: 2000,
      etiqueta: "$2.000",
    });

    const resumen = calcularResumen(await lineasConConteo(sesionId));

    expect(resumen.totalUnidades).toBe(365);
    expect(resumen.totalMonetario).toBe(55 * 5000 + 310 * 2000);
    expect(resumen.numCategoriasConConteo).toBe(2);
    expect(resumen.porCategoria.cat_5000).toEqual({
      cantidad: 55,
      subtotal: 275000,
      actualizadaEn: expect.anything(),
    });
  });

  it("sesión vacía: totales en cero, sin categoriaMayor/Menor", () => {
    const resumen = calcularResumen([]);

    expect(resumen.totalUnidades).toBe(0);
    expect(resumen.totalMonetario).toBe(0);
    expect(resumen.numCategoriasConConteo).toBe(0);
    expect(resumen.categoriaMayor).toBeNull();
    expect(resumen.categoriaMenor).toBeNull();
    expect(resumen.porCategoria).toEqual({});
  });

  it("extremos: una sola categoría es a la vez mayor y menor", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarLinea(sesionId, "cat_unica", {
      cantidadTotal: 42,
      valorUnitario: 1000,
      etiqueta: "$1.000",
    });

    const resumen = calcularResumen(await lineasConConteo(sesionId));

    expect(resumen.categoriaMayor).toEqual({
      categoriaId: "cat_unica",
      etiqueta: "$1.000",
      cantidad: 42,
    });
    expect(resumen.categoriaMenor).toEqual({
      categoriaId: "cat_unica",
      etiqueta: "$1.000",
      cantidad: 42,
    });
  });

  it("D-2 · una categoría cuyo cantidadTotal cae a 0 queda fuera de porCategoria", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarLinea(sesionId, "cat_activa", { cantidadTotal: 10, etiqueta: "$5.000" });
    await sembrarLinea(sesionId, "cat_vaciada", { cantidadTotal: 0, etiqueta: "$5.000" });

    const resumen = calcularResumen(await lineasConConteo(sesionId));

    expect(Object.keys(resumen.porCategoria)).toEqual(["cat_activa"]);
  });

  it("agrega porArea sumando entre todas las líneas con conteo (ADR-23)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await sembrarLinea(sesionId, "cat_1", {
      cantidadTotal: 55,
      valorUnitario: 1000,
      etiqueta: "$1.000",
      porArea: { area_1: 30, area_2: 25 },
    });
    await sembrarLinea(sesionId, "cat_2", {
      cantidadTotal: 15,
      valorUnitario: 2000,
      etiqueta: "$2.000",
      porArea: { area_1: 10, area_3: 5 },
    });

    const resumen = calcularResumen(await lineasConConteo(sesionId));

    expect(resumen.porArea).toEqual({
      area_1: 40,
      area_2: 25,
      area_3: 5,
    });
  });
});
