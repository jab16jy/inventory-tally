// Pruebas contra el emulador de Firestore (D-5: los aportes son la fuente de
// verdad; la corrección debe reescribir aplicados/versiones, no sólo
// cantidadTotal). Se prueba `reconciliarLineasImpl` directamente, misma
// decisión que el resto del paquete.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { reconciliarLineasImpl } from "../../src/scheduled/reconciliar-lineas.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

async function crearSesion(sesionId: string, estado: "abierta" | "cerrada"): Promise<void> {
  await db.doc(`sesiones/${sesionId}`).set({
    sucursalId: "suc_norte",
    estado,
    participantes: [],
    totalUnidades: 0,
  });
}

interface DatosLinea {
  readonly cantidadTotal: number;
  readonly aplicados?: Record<string, number>;
  readonly versiones?: Record<string, number>;
  readonly numAportantes?: number;
}

async function sembrarLinea(
  sesionId: string,
  categoriaId: string,
  valorUnitario: number,
  etiqueta: string,
  datos: DatosLinea,
): Promise<void> {
  await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).set({
    categoriaId,
    valorUnitario,
    etiqueta,
    cantidadTotal: datos.cantidadTotal,
    aplicados: datos.aplicados ?? {},
    versiones: datos.versiones ?? {},
    numAportantes: datos.numAportantes ?? 0,
    actualizadaEn: new Date(),
    actualizadaPor: "uid_admin",
  });
}

async function sembrarAporte(
  sesionId: string,
  categoriaId: string,
  uid: string,
  nombre: string,
  cantidad: number,
  version: number,
): Promise<void> {
  await db
    .doc(`sesiones/${sesionId}/lineas/${categoriaId}/aportes/${uid}`)
    .set({ uid, nombre, cantidad, version });
}

async function lineaDe(sesionId: string, categoriaId: string) {
  return db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
}

async function resumenDe(sesionId: string) {
  return db.doc(`sesiones/${sesionId}/resumen/actual`).get();
}

async function reconciliacionesDe(categoriaId: string) {
  const snap = await db.collection("auditoria").where("tipo", "==", "RECONCILIACION").get();
  return snap.docs.filter((d) => d.get("categoriaId") === categoriaId);
}

describe("reconciliarLineasImpl", () => {
  it("sesión abierta · línea desincronizada se corrige, línea sana en la misma sesión queda intacta", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");

    await sembrarLinea(sesionId, "cat_ok", 1000, "OK", {
      cantidadTotal: 10,
      aplicados: { uid_ana: 10 },
      versiones: { uid_ana: 1 },
      numAportantes: 1,
    });
    await sembrarAporte(sesionId, "cat_ok", "uid_ana", "Ana", 10, 1);

    await sembrarLinea(sesionId, "cat_mal", 500, "MAL", {
      cantidadTotal: 50,
      aplicados: { uid_luis: 50 },
      versiones: { uid_luis: 1 },
      numAportantes: 1,
    });
    await sembrarAporte(sesionId, "cat_mal", "uid_luis", "Luis", 30, 1);
    await sembrarAporte(sesionId, "cat_mal", "uid_ana", "Ana", 23, 1);

    await reconciliarLineasImpl(db);

    const ok = await lineaDe(sesionId, "cat_ok");
    expect(ok.get("cantidadTotal")).toBe(10);
    expect(await reconciliacionesDe("cat_ok")).toHaveLength(0);

    const mal = await lineaDe(sesionId, "cat_mal");
    expect(mal.get("cantidadTotal")).toBe(53);

    // `totalUnidades` de la sesión sube por el DELTA (53-50=3), no por el
    // total corregido: la línea sana no aporta nada. Sin esta aserción, un
    // signo invertido o la ausencia del incremento pasarían inadvertidos.
    expect((await db.doc(`sesiones/${sesionId}`).get()).get("totalUnidades")).toBe(3);
  });

  it("sesión cerrada nunca se toca, aunque una sesión abierta tenga el mismo tipo de desajuste", async () => {
    const abiertaId = `ses_${randomUUID()}`;
    await crearSesion(abiertaId, "abierta");
    await sembrarLinea(abiertaId, "cat_a", 100, "A", { cantidadTotal: 5 });
    await sembrarAporte(abiertaId, "cat_a", "uid_x", "X", 8, 1);

    const cerradaId = `ses_${randomUUID()}`;
    await crearSesion(cerradaId, "cerrada");
    await sembrarLinea(cerradaId, "cat_b", 100, "B", { cantidadTotal: 5 });
    await sembrarAporte(cerradaId, "cat_b", "uid_y", "Y", 8, 1);

    await reconciliarLineasImpl(db);

    expect((await lineaDe(abiertaId, "cat_a")).get("cantidadTotal")).toBe(8);
    expect((await lineaDe(cerradaId, "cat_b")).get("cantidadTotal")).toBe(5); // sin tocar
    expect(await reconciliacionesDe("cat_b")).toHaveLength(0);
  });

  it("corrección reescribe aplicados/versiones/numAportantes por completo, no sólo cantidadTotal (D-5)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    // uid_fantasma no tiene aporte real (simula uno borrado tras un trigger
    // fallido) y los dos uids reales traen valores desactualizados.
    await sembrarLinea(sesionId, "cat_x", 200, "X", {
      cantidadTotal: 999,
      aplicados: { uid_fantasma: 40, uid_ana: 1, uid_luis: 1 },
      versiones: { uid_fantasma: 5, uid_ana: 1, uid_luis: 1 },
      numAportantes: 3,
    });
    await sembrarAporte(sesionId, "cat_x", "uid_ana", "Ana", 10, 3);
    await sembrarAporte(sesionId, "cat_x", "uid_luis", "Luis", 7, 2);

    await reconciliarLineasImpl(db);

    const linea = await lineaDe(sesionId, "cat_x");
    expect(linea.get("cantidadTotal")).toBe(17);
    expect(linea.get("aplicados")).toEqual({ uid_ana: 10, uid_luis: 7 });
    expect(linea.get("versiones")).toEqual({ uid_ana: 3, uid_luis: 2 });
    expect(linea.get("numAportantes")).toBe(2);
  });

  it("corrección audita RECONCILIACION con cantidadAnterior/cantidadNueva y sin otro efecto", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    await sembrarLinea(sesionId, "cat_y", 300, "Y", { cantidadTotal: 50 });
    await sembrarAporte(sesionId, "cat_y", "uid_ana", "Ana", 53, 1);

    await reconciliarLineasImpl(db);

    const eventos = await reconciliacionesDe("cat_y");
    expect(eventos).toHaveLength(1);
    expect(eventos[0]?.get("sesionId")).toBe(sesionId);
    expect(eventos[0]?.get("cantidadAnterior")).toBe(50);
    expect(eventos[0]?.get("cantidadNueva")).toBe(53);
  });

  it("corrección vuelve a marcar el resumen dirty y sube marcaAportes (I-M)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    await db.doc(`sesiones/${sesionId}/resumen/actual`).set({ dirty: false, marcaAportes: 2 });
    await sembrarLinea(sesionId, "cat_z", 100, "Z", { cantidadTotal: 1 });
    await sembrarAporte(sesionId, "cat_z", "uid_ana", "Ana", 4, 1);

    await reconciliarLineasImpl(db);

    const resumen = await resumenDe(sesionId);
    expect(resumen.get("dirty")).toBe(true);
    expect(resumen.get("marcaAportes")).toBe(3);
  });

  it("reejecutar sin aportes nuevos no vuelve a corregir ni a auditar (no-op)", async () => {
    const sesionId = `ses_${randomUUID()}`;
    await crearSesion(sesionId, "abierta");
    await sembrarLinea(sesionId, "cat_w", 100, "W", { cantidadTotal: 1 });
    await sembrarAporte(sesionId, "cat_w", "uid_ana", "Ana", 9, 1);

    await reconciliarLineasImpl(db);
    const trasPrimera = await reconciliacionesDe("cat_w");

    await reconciliarLineasImpl(db);

    expect((await lineaDe(sesionId, "cat_w")).get("cantidadTotal")).toBe(9);
    expect(await reconciliacionesDe("cat_w")).toHaveLength(trasPrimera.length);
  });
});
