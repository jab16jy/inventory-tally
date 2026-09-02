// Pruebas contra el emulador de Firestore (doc 08 §3, ADR-21).
// `unauthenticated`/entrada inválida NO se reprueban aquí: `autorizacionDe`
// y `vincularAreaSchema` ya tienen su propio test genérico (misma convención
// que el resto de callables). `exigirAdminOCajeroDeSesion` también tiene su
// propio test puro (exigir-cajero-de-sesion.test.ts); aquí sólo se prueba que
// vincularAreaImpl lo invoca correctamente dentro de su transacción.
//
// RIESGO CRÍTICO (docs/plan-panel-administrador.md §6, riesgo 1):
// `categoriasValor` es una colección GLOBAL y los archivos de test corren en
// paralelo contra el mismo emulador (`abrirSesionImpl` siembra sobre TODA la
// colección `activa == true`). Cada test borra en `afterEach` toda
// categoría/área/sesión que creó, para no filtrar hacia otro archivo de test
// en la SIGUIENTE corrida. `randomUUID()` en cada etiqueta/id creado.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import { vincularAreaImpl } from "../../src/callables/vincular-area.js";
import type { AutorizacionCajero } from "../../src/lib/exigir-cajero-de-sesion.js";
import { SIN_AREA } from "@conteo/shared/models/linea-conteo.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const admin: AutorizacionCajero = { uid: "uid_admin", rol: "admin", sucursales: [] };
const cajero = (sucursales: readonly string[]): AutorizacionCajero => ({
  uid: "uid_cajero",
  rol: "cajero",
  sucursales,
});

const sesionesCreadas: string[] = [];
const areasCreadas: string[] = [];
const categoriasCreadas: string[] = [];

afterEach(async () => {
  const sesiones = sesionesCreadas.splice(0);
  const areas = areasCreadas.splice(0);
  const categorias = categoriasCreadas.splice(0);
  await Promise.all([
    ...sesiones.map(async (sesionId) => {
      const lineas = await db.collection(`sesiones/${sesionId}/lineas`).get();
      await Promise.all(lineas.docs.map((linea) => linea.ref.delete()));
      await db.doc(`sesiones/${sesionId}`).delete();
    }),
    ...areas.map((areaId) => db.doc(`areas/${areaId}`).delete()),
    ...categorias.map((categoriaId) => db.doc(`categoriasValor/${categoriaId}`).delete()),
  ]);
});

async function crearSesion(sucursalId: string, estado: "abierta" | "cerrada" = "abierta") {
  const sesionId = `ses_${randomUUID()}`;
  await db.doc(`sesiones/${sesionId}`).set({ sucursalId, estado });
  sesionesCreadas.push(sesionId);
  return sesionId;
}

async function crearArea(nombre: string, activa = true) {
  const areaId = `area_${randomUUID()}`;
  await db.doc(`areas/${areaId}`).set({ nombre, activa });
  areasCreadas.push(areaId);
  return areaId;
}

async function crearCategoria(areaId?: string) {
  const categoriaId = `cat_${randomUUID()}`;
  await db.doc(`categoriasValor/${categoriaId}`).set({
    etiqueta: `Categoría ${randomUUID()}`,
    valor: 1000,
    activa: true,
    orden: 1,
    ...(areaId !== undefined && { areaId }),
  });
  categoriasCreadas.push(categoriaId);
  return categoriaId;
}

async function crearLinea(sesionId: string, categoriaId: string, area: string) {
  await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).set({
    categoriaId,
    valorUnitario: 1000,
    etiqueta: "Etiqueta",
    area,
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaPor: "uid_semilla",
  });
}

describe("vincularAreaImpl (I-6/A-3/A-4, ADR-21)", () => {
  it("vincula: escribe categoriasValor.areaId y re-etiqueta la línea SIN_AREA", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Aseo");
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    const resultado = await vincularAreaImpl(db, admin, { sesionId, categoriaId, areaId });

    expect(resultado).toEqual({ categoriaId, areaId, lineaActualizada: true });
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("areaId")).toBe(areaId);
    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe("Aseo");
  });

  it("ADR-21 · una línea YA etiquetada con área real NO se re-etiqueta (par negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Cocina");
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, "Aseo"); // ya tiene área real, distinta

    const resultado = await vincularAreaImpl(db, admin, { sesionId, categoriaId, areaId });

    expect(resultado.lineaActualizada).toBe(false);
    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe("Aseo"); // sin cambios
  });

  it("categoría con OTRA área ya asignada → failed-precondition", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const otraArea = await crearArea("Otra");
    const areaId = await crearArea("Nueva");
    const categoriaId = await crearCategoria(otraArea);

    await expect(vincularAreaImpl(db, admin, { sesionId, categoriaId, areaId })).rejects.toThrow(
      HttpsError,
    );
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("areaId")).toBe(otraArea); // sin cambios
  });

  it("categoría con la MISMA área ya asignada → idempotente, pasa (par afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Aseo");
    const categoriaId = await crearCategoria(areaId);

    const resultado = await vincularAreaImpl(db, admin, { sesionId, categoriaId, areaId });

    expect(resultado.areaId).toBe(areaId);
  });

  it("área inactiva → failed-precondition", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Inactiva", false);
    const categoriaId = await crearCategoria();

    await expect(vincularAreaImpl(db, admin, { sesionId, categoriaId, areaId })).rejects.toThrow(
      HttpsError,
    );
  });

  it("área inexistente → not-found", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const categoriaId = await crearCategoria();

    await expect(
      vincularAreaImpl(db, admin, { sesionId, categoriaId, areaId: `area_${randomUUID()}` }),
    ).rejects.toThrow(HttpsError);
  });

  it("cajero SIN la sucursal de la sesión → permission-denied (A-3)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Aseo");
    const categoriaId = await crearCategoria();

    await expect(
      vincularAreaImpl(db, cajero([`suc_ajena_${randomUUID()}`]), {
        sesionId,
        categoriaId,
        areaId,
      }),
    ).rejects.toThrow(HttpsError);
  });

  it("sesión cerrada → failed-precondition (A-4)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId, "cerrada");
    const areaId = await crearArea("Aseo");
    const categoriaId = await crearCategoria();

    await expect(vincularAreaImpl(db, admin, { sesionId, categoriaId, areaId })).rejects.toThrow(
      HttpsError,
    );
  });

  it("emite AREA_VINCULADA con sucursalId en la misma transacción", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Aseo");
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    await vincularAreaImpl(db, admin, { sesionId, categoriaId, areaId });

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", categoriaId)
      .where("tipo", "==", "AREA_VINCULADA")
      .get();
    expect(eventos.size).toBe(1);
    expect(eventos.docs[0]?.get("sucursalId")).toBe(sucursalId);
    expect(eventos.docs[0]?.get("sesionId")).toBe(sesionId);
    expect(eventos.docs[0]?.get("areaId")).toBe(areaId);
  });
});
