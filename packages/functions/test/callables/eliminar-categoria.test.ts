// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `eliminarCategoriaSchema` ya tienen su propio test
// genérico, misma convención que `desactivarCategoria`.
//
// RIESGO CRÍTICO (docs/plan-panel-administrador.md §6, riesgo 1):
// `categoriasValor` es una colección GLOBAL y `abrirSesionImpl` siembra una
// línea por cada doc con `activa == true` de TODA la colección, sin
// aislamiento por sufijo. Cada test borra en `afterEach` toda categoría y
// sesión que sembró, para no filtrar estado hacia `abrir-sesion.test.ts` /
// `cerrar-sesion.test.ts` en la SIGUIENTE corrida.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import { eliminarCategoriaImpl } from "../../src/callables/eliminar-categoria.js";
import { abrirSesionImpl } from "../../src/callables/abrir-sesion.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const categoriasCreadas: string[] = [];
const sesionesCreadas: string[] = [];
const sucursalesCreadas: string[] = [];

afterEach(async () => {
  const sesionesPendientes = sesionesCreadas.splice(0);
  await Promise.all(sesionesPendientes.map((id) => db.recursiveDelete(db.doc(`sesiones/${id}`))));
  const sucursalesPendientes = sucursalesCreadas.splice(0);
  await Promise.all(sucursalesPendientes.map((id) => db.doc(`sucursales/${id}`).delete()));
  const idsPendientes = categoriasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`categoriasValor/${id}`).delete()));
});

async function sembrarCategoria(activa = true) {
  const categoriaId = `cat_${randomUUID()}`;
  await db.doc(`categoriasValor/${categoriaId}`).set({
    etiqueta: "Litro",
    valor: 1000,
    orden: 1,
    activa,
  });
  categoriasCreadas.push(categoriaId);
  return categoriaId;
}

async function sembrarSucursal() {
  const sucursalId = `suc_${randomUUID()}`;
  await db.doc(`sucursales/${sucursalId}`).set({
    nombre: "Sucursal categorías",
    direccion: "Dirección",
    conectividad: "wifi",
    activa: true,
    sesionAbiertaId: null,
  });
  sucursalesCreadas.push(sucursalId);
  return sucursalId;
}

describe("eliminarCategoriaImpl", () => {
  it("elimina físicamente una categoría sin referencias (afirmativo)", async () => {
    const categoriaId = await sembrarCategoria();

    const resultado = await eliminarCategoriaImpl(db, "uid_admin", { categoriaId });

    expect(resultado.eliminada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.exists).toBe(false);
    categoriasCreadas.splice(categoriasCreadas.indexOf(categoriaId), 1);
  });

  it("emite CATEGORIA_ELIMINADA en la misma transacción", async () => {
    const categoriaId = await sembrarCategoria();

    await eliminarCategoriaImpl(db, "uid_admin", { categoriaId });
    categoriasCreadas.splice(categoriasCreadas.indexOf(categoriaId), 1);

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", categoriaId)
      .where("tipo", "==", "CATEGORIA_ELIMINADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("categoriaId desconocido · rechaza not-found", async () => {
    await expect(
      eliminarCategoriaImpl(db, "uid_admin", {
        categoriaId: `cat_inexistente_${randomUUID()}`,
      }),
    ).rejects.toThrow(HttpsError);
  });

  it("categoría referenciada por la línea de una sesión abierta · rechaza failed-precondition y no la borra", async () => {
    const categoriaId = await sembrarCategoria();
    const sucursalId = await sembrarSucursal();
    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });
    sesionesCreadas.push(sesionId);
    const lineaAntes = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(lineaAntes.exists).toBe(true);

    await expect(eliminarCategoriaImpl(db, "uid_admin", { categoriaId })).rejects.toThrow(
      /usada en 1 conteo/,
    );

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.exists).toBe(true);
  });
});
