// Pruebas contra el emulador de Firestore (doc 08 §3, ADR-21, I-9).
// `unauthenticated`/entrada inválida NO se reprueban aquí: `autorizacionDe` y
// `crearCategoriaEnSesionSchema` ya tienen su propio test genérico.
//
// RIESGO CRÍTICO (docs/plan-panel-administrador.md §6, riesgo 1):
// `categoriasValor` es una colección GLOBAL, los archivos de test corren en
// paralelo contra el mismo emulador, y `abrirSesionImpl` siembra sobre TODA
// la colección `activa == true`. Cada test borra en `afterEach` toda
// categoría/área/sesión que creó. `randomUUID()` en cada etiqueta/id.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import { crearCategoriaEnSesionImpl } from "../../src/callables/crear-categoria-en-sesion.js";
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

function registrarCategoria(categoriaId: string) {
  categoriasCreadas.push(categoriaId);
}

describe("crearCategoriaEnSesionImpl (I-9/ADR-07, ADR-21)", () => {
  it("crea la categoría con valor: 0, activa: true, orden: 0, sucursalesAsignadas: [sucursalId]", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);
    const etiqueta = `Producto ${randomUUID()}`;

    const resultado = await crearCategoriaEnSesionImpl(db, admin, { sesionId, etiqueta });
    registrarCategoria(resultado.categoriaId);

    expect(resultado.creada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${resultado.categoriaId}`).get();
    expect(categoria.get("etiqueta")).toBe(etiqueta);
    expect(categoria.get("valor")).toBe(0);
    expect(categoria.get("activa")).toBe(true);
    expect(categoria.get("orden")).toBe(0);
    expect(categoria.get("sucursalesAsignadas")).toEqual([sucursalId]);
  });

  it("siembra la línea en la sesión con valorUnitario: 0 y cantidadTotal: 0", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);

    const resultado = await crearCategoriaEnSesionImpl(db, admin, {
      sesionId,
      etiqueta: `Producto ${randomUUID()}`,
    });
    registrarCategoria(resultado.categoriaId);

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${resultado.categoriaId}`).get();
    expect(linea.exists).toBe(true);
    expect(linea.get("valorUnitario")).toBe(0);
    expect(linea.get("cantidadTotal")).toBe(0);
  });

  it("sin areaId la línea nace con SIN_AREA; con areaId nace con el nombre del área (par afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);

    const sinArea = await crearCategoriaEnSesionImpl(db, admin, {
      sesionId,
      etiqueta: `Producto ${randomUUID()}`,
    });
    registrarCategoria(sinArea.categoriaId);
    const lineaSinArea = await db.doc(`sesiones/${sesionId}/lineas/${sinArea.categoriaId}`).get();
    expect(lineaSinArea.get("area")).toBe(SIN_AREA);

    const areaId = await crearArea("Aseo");
    const conArea = await crearCategoriaEnSesionImpl(db, admin, {
      sesionId,
      etiqueta: `Producto ${randomUUID()}`,
      areaId,
    });
    registrarCategoria(conArea.categoriaId);
    const categoriaConArea = await db.doc(`categoriasValor/${conArea.categoriaId}`).get();
    expect(categoriaConArea.get("areaIds")).toEqual([areaId]);
    const lineaConArea = await db.doc(`sesiones/${sesionId}/lineas/${conArea.categoriaId}`).get();
    expect(lineaConArea.get("area")).toBe("Aseo");
  });

  it("cajero SIN la sucursal de la sesión → permission-denied", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);

    await expect(
      crearCategoriaEnSesionImpl(db, cajero([`suc_ajena_${randomUUID()}`]), {
        sesionId,
        etiqueta: `Producto ${randomUUID()}`,
      }),
    ).rejects.toThrow(HttpsError);
  });

  it("sesión cerrada → failed-precondition", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId, "cerrada");

    await expect(
      crearCategoriaEnSesionImpl(db, admin, { sesionId, etiqueta: `Producto ${randomUUID()}` }),
    ).rejects.toThrow(HttpsError);
  });

  it("emite CATEGORIA_CREADA con sucursalId y origen: conteo", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const sesionId = await crearSesion(sucursalId);

    const resultado = await crearCategoriaEnSesionImpl(db, admin, {
      sesionId,
      etiqueta: `Producto ${randomUUID()}`,
    });
    registrarCategoria(resultado.categoriaId);

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", resultado.categoriaId)
      .where("tipo", "==", "CATEGORIA_CREADA")
      .get();
    expect(eventos.size).toBe(1);
    expect(eventos.docs[0]?.get("sucursalId")).toBe(sucursalId);
    expect(eventos.docs[0]?.get("origen")).toBe("conteo");
  });
});
