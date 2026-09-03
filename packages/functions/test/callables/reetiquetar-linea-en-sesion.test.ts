// Pruebas contra el emulador de Firestore (ADR-22). Mismo riesgo crítico que
// vincular-area.test.ts (docs/plan-panel-administrador.md §6, riesgo 1):
// `categoriasValor` es una colección GLOBAL y los archivos de test corren en
// paralelo contra el mismo emulador. Cada test borra en `afterEach` toda
// categoría/área/sesión que creó. `randomUUID()` en cada etiqueta/id creado.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import { reetiquetarLineaEnSesionImpl } from "../../src/callables/reetiquetar-linea-en-sesion.js";
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

async function crearCategoria(areaIds?: string | readonly string[]) {
  const categoriaId = `cat_${randomUUID()}`;
  const ids = typeof areaIds === "string" ? [areaIds] : areaIds;
  await db.doc(`categoriasValor/${categoriaId}`).set({
    etiqueta: `Categoría ${randomUUID()}`,
    valor: 1000,
    activa: true,
    orden: 1,
    ...(ids !== undefined && { areaIds: ids }),
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
    areaFijaPorAdmin: false,
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaPor: "uid_semilla",
  });
}

describe("reetiquetarLineaEnSesionImpl (I-6/A-3/A-4, ADR-22)", () => {
  it("reetiqueta libremente una línea SIN_AREA de una categoría sin areaId de catálogo", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Talleres");
    const categoriaId = await crearCategoria(); // sin areaId de catálogo
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    const resultado = await reetiquetarLineaEnSesionImpl(db, admin, {
      sesionId,
      categoriaId,
      areaId,
    });

    expect(resultado).toEqual({ categoriaId, areaId });
    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe("Talleres");
    // Nunca toca el catálogo (diferencia estructural con vincularArea).
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("areaIds")).toBeUndefined();
  });

  it("ADR-22 · reetiqueta una línea que YA tenía un área real, más de una vez, en la misma sesión", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const talleres = await crearArea("Talleres");
    const aseo = await crearArea("Aseo");
    const categoriaId = await crearCategoria(); // sin areaId de catálogo
    await crearLinea(sesionId, categoriaId, "Talleres"); // ya reetiquetada una vez

    await reetiquetarLineaEnSesionImpl(db, admin, { sesionId, categoriaId, areaId: aseo });

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe("Aseo");

    // Y de nuevo, sin límite de veces.
    await reetiquetarLineaEnSesionImpl(db, admin, { sesionId, categoriaId, areaId: talleres });
    const lineaOtraVez = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(lineaOtraVez.get("area")).toBe("Talleres");
  });

  it("ADR-22 · permite volver a SIN_AREA (areaId omitido)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, "Aseo");

    await reetiquetarLineaEnSesionImpl(db, admin, { sesionId, categoriaId, areaId: undefined });

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe(SIN_AREA);
  });

  it("ADR-22 · permite volver a SIN_AREA (areaId null, limpiado explícitamente)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, "Aseo");

    await reetiquetarLineaEnSesionImpl(db, admin, { sesionId, categoriaId, areaId: null });

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe(SIN_AREA);
  });

  it("condición dura ADR-22 · categoría con areaId YA fijado en el catálogo → failed-precondition", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const fijaId = await crearArea("Fija");
    const nuevaId = await crearArea("Nueva");
    const categoriaId = await crearCategoria(fijaId); // admin ya la fijó
    await crearLinea(sesionId, categoriaId, "Fija");

    await expect(
      reetiquetarLineaEnSesionImpl(db, admin, { sesionId, categoriaId, areaId: nuevaId }),
    ).rejects.toThrow(HttpsError);
    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe("Fija"); // sin cambios
  });

  it("permite reetiquetar cuando la categoría tiene múltiples áreas en el catálogo (ambiguo, decide el cajero)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const area1Id = await crearArea("Area 1");
    const area2Id = await crearArea("Area 2");
    const nuevaId = await crearArea("Nueva");
    const categoriaId = await crearCategoria([area1Id, area2Id]);
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    const resultado = await reetiquetarLineaEnSesionImpl(db, admin, {
      sesionId,
      categoriaId,
      areaId: nuevaId,
    });
    expect(resultado).toEqual({ categoriaId, areaId: nuevaId });
    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe("Nueva");
  });

  it("área inactiva → failed-precondition", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Inactiva", false);
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    await expect(
      reetiquetarLineaEnSesionImpl(db, admin, { sesionId, categoriaId, areaId }),
    ).rejects.toThrow(HttpsError);
  });

  it("área inexistente → not-found", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    await expect(
      reetiquetarLineaEnSesionImpl(db, admin, {
        sesionId,
        categoriaId,
        areaId: `area_${randomUUID()}`,
      }),
    ).rejects.toThrow(HttpsError);
  });

  it("categoría inexistente → not-found", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);

    await expect(
      reetiquetarLineaEnSesionImpl(db, admin, {
        sesionId,
        categoriaId: `cat_${randomUUID()}`,
        areaId: undefined,
      }),
    ).rejects.toThrow(HttpsError);
  });

  it("cajero SIN la sucursal de la sesión → permission-denied (A-3)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Aseo");
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    await expect(
      reetiquetarLineaEnSesionImpl(db, cajero([`suc_ajena_${randomUUID()}`]), {
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
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    await expect(
      reetiquetarLineaEnSesionImpl(db, admin, { sesionId, categoriaId, areaId }),
    ).rejects.toThrow(HttpsError);
  });

  it("emite LINEA_REETIQUETADA con sucursalId en la misma transacción", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const areaId = await crearArea("Aseo");
    const categoriaId = await crearCategoria();
    await crearLinea(sesionId, categoriaId, SIN_AREA);

    await reetiquetarLineaEnSesionImpl(db, admin, { sesionId, categoriaId, areaId });

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", categoriaId)
      .where("tipo", "==", "LINEA_REETIQUETADA")
      .get();
    expect(eventos.size).toBe(1);
    expect(eventos.docs[0]?.get("sucursalId")).toBe(sucursalId);
    expect(eventos.docs[0]?.get("sesionId")).toBe(sesionId);
    expect(eventos.docs[0]?.get("areaId")).toBe(areaId);
  });
});
