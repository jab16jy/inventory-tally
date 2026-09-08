// Pruebas contra el emulador de Firestore (D-1: compare-and-clear sobre un
// marcador monotónico). Se prueba `recalcularResumenesImpl` directamente
// (sin el emulador de Functions), misma decisión que el resto del paquete.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Transaction } from "firebase-admin/firestore";
import { afterEach, describe, expect, it, vi } from "vitest";
import { recalcularResumenesImpl } from "../../src/scheduled/recalcular-resumenes.js";
import { procesarAporteEscrito } from "../../src/triggers/on-aporte-escrito.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const sesionesCreadas: string[] = [];

afterEach(async () => {
  await Promise.all(sesionesCreadas.map((id) => db.recursiveDelete(db.doc(`sesiones/${id}`))));
  sesionesCreadas.length = 0;
});

async function crearSesion(sesionId: string, estado: "abierta" | "cerrada"): Promise<void> {
  sesionesCreadas.push(sesionId);
  await db.doc(`sesiones/${sesionId}`).set({
    sucursalId: "suc_norte",
    estado,
    participantes: [],
    totalUnidades: 0,
  });
}

async function sembrarLinea(
  sesionId: string,
  categoriaId: string,
  valorUnitario: number,
  etiqueta: string,
): Promise<void> {
  await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).set({
    categoriaId,
    valorUnitario,
    etiqueta,
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "uid_admin",
  });
}

async function aportar(
  sesionId: string,
  categoriaId: string,
  uid: string,
  nombre: string,
  cantidad: number,
  version: number,
  areaId = "area_1",
): Promise<void> {
  const claveAporte = `${uid}__${areaId}`;
  await procesarAporteEscrito(db, { sesionId, categoriaId, claveAporte }, undefined, {
    uid,
    areaId,
    nombre,
    cantidad,
    version,
  });
}

async function resumenDe(sesionId: string) {
  return db.doc(`sesiones/${sesionId}/resumen/actual`).get();
}

describe("recalcularResumenesImpl", () => {
  it("una sesión con datos corruptos no bloquea el recálculo de las demás", async () => {
    // Línea sin `valorUnitario`/`etiqueta` (I-7 nunca debería permitir esto,
    // pero un cliente desincronizado que aporta a una categoría no sembrada
    // sí podría producirlo): calcularResumen no puede construir su
    // categoriaMayor/Menor con un campo faltante. Sin aislamiento por
    // sesión, este único documento corrupto abortaría el `for` completo y
    // ninguna otra sesión abierta se recalcularía ese ciclo.
    const sesionCorruptaId = `ses_${randomUUID()}`;
    await crearSesion(sesionCorruptaId, "abierta");
    await db.doc(`sesiones/${sesionCorruptaId}/lineas/cat_huerfana`).set({
      categoriaId: "cat_huerfana",
      cantidadTotal: 5,
      versiones: {},
      actualizadaEn: new Date(),
      actualizadaPor: "uid_ana",
    });
    await db
      .doc(`sesiones/${sesionCorruptaId}/resumen/actual`)
      .set({ dirty: true, marcaAportes: 1 });

    const sesionSanaId = `ses_${randomUUID()}`;
    await crearSesion(sesionSanaId, "abierta");
    await sembrarLinea(sesionSanaId, "cat_5000", 5000, "$5.000");
    await aportar(sesionSanaId, "cat_5000", "uid_luis", "Luis", 20, 1);

    await recalcularResumenesImpl(db);

    const resumenSano = await resumenDe(sesionSanaId);
    expect(resumenSano.get("dirty")).toBe(false);
    expect(resumenSano.get("totalUnidades")).toBe(20);

    const resumenCorrupto = await resumenDe(sesionCorruptaId);
    expect(resumenCorrupto.get("dirty")).toBe(true); // sin escribir, reintenta después
  });

  it("Cron scope · una sesión abierta y dirty se recomputa", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    await sembrarLinea(sesionId, "cat_5000", 5000, "$5.000");
    await aportar(sesionId, "cat_5000", "uid_ana", "Ana", 10, 1);

    await recalcularResumenesImpl(db);

    const resumen = await resumenDe(sesionId);
    expect(resumen.get("dirty")).toBe(false);
    expect(resumen.get("totalUnidades")).toBe(10);
    expect(resumen.get("totalMonetario")).toBe(50000);
  });

  it("Cron scope · una sesión cerrada nunca se toca (lineas ni resumen)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "cerrada");
    await sembrarLinea(sesionId, "cat_5000", 5000, "$5.000");
    await db
      .doc(`sesiones/${sesionId}/resumen/actual`)
      .set({ dirty: true, marcaAportes: 3, totalUnidades: 999 });

    await recalcularResumenesImpl(db);

    const resumen = await resumenDe(sesionId);
    expect(resumen.get("dirty")).toBe(true); // sin tocar
    expect(resumen.get("totalUnidades")).toBe(999); // sin tocar
  });

  it("Resumen limpio se salta · dirty:false no dispara consulta de lineas", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    await db.doc(`sesiones/${sesionId}/resumen/actual`).set({ dirty: false, totalUnidades: 999 });
    // A propósito, sin lineas sembradas: si el cron consultara igual y
    // escribiera, totalUnidades pasaría de 999 a 0.

    await recalcularResumenesImpl(db);

    const resumen = await resumenDe(sesionId);
    expect(resumen.get("totalUnidades")).toBe(999);
  });

  it("Resumen dirty NO se salta · dispara la consulta y recalcula", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    await sembrarLinea(sesionId, "cat_5000", 5000, "$5.000");
    await aportar(sesionId, "cat_5000", "uid_ana", "Ana", 7, 1);

    await recalcularResumenesImpl(db);

    const resumen = await resumenDe(sesionId);
    expect(resumen.get("totalUnidades")).toBe(7);
  });

  it("afirmativo · sin aporte concurrente, dirty se limpia correctamente", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    await sembrarLinea(sesionId, "cat_5000", 5000, "$5.000");
    await aportar(sesionId, "cat_5000", "uid_ana", "Ana", 10, 1);

    await recalcularResumenesImpl(db);

    const resumen = await resumenDe(sesionId);
    expect(resumen.get("dirty")).toBe(false);
    expect(resumen.get("totalUnidades")).toBe(10);
    expect(resumen.get("marcaAportes")).toBe(1);
  });

  it("negativo · un aporte concurrente durante el recálculo NO limpia dirty falsamente", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    await sembrarLinea(sesionId, "cat_5000", 5000, "$5.000");
    await aportar(sesionId, "cat_5000", "uid_ana", "Ana", 10, 1);

    const runTransactionOriginal = db.runTransaction.bind(db);
    // Interleaving determinista (misma técnica que abrir-sesion.test.ts:90,
    // vi.spyOn en vez de temporizadores): el aporte concurrente de Luis llega
    // DESPUÉS de que el cron ya leyó `lineas` (paso 2) pero ANTES de que
    // arranque su transacción de comparación (paso 3) — muta la línea Y sube
    // `marcaAportes` en el intervalo exacto que D-1 exige cubrir.
    const espia = vi
      .spyOn(db, "runTransaction")
      .mockImplementationOnce(async (updateFunction: (tx: Transaction) => Promise<unknown>) => {
        await aportar(sesionId, "cat_5000", "uid_luis", "Luis", 5, 1);
        return runTransactionOriginal(updateFunction);
      });

    await recalcularResumenesImpl(db);
    espia.mockRestore();

    const resumen = await resumenDe(sesionId);
    // Nada se escribió: dirty sigue true y ningún campo derivado quedó a
    // medias con el estado de ANTES del aporte de Luis (cantidadTotal=10).
    expect(resumen.get("dirty")).toBe(true);
    expect(resumen.get("totalUnidades")).toBeUndefined();
    expect(resumen.get("marcaAportes")).toBe(2); // el trigger de Luis sí subió el marcador

    // El siguiente ciclo sí converge, ya con el aporte de Luis incluido.
    await recalcularResumenesImpl(db);
    const resumenFinal = await resumenDe(sesionId);
    expect(resumenFinal.get("dirty")).toBe(false);
    expect(resumenFinal.get("totalUnidades")).toBe(15);
  });
});
