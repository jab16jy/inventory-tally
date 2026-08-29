// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `eliminarAreaSchema` ya tienen su propio test
// genérico, misma convención que `desactivarArea`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import { eliminarAreaImpl } from "../../src/callables/eliminar-area.js";
import { abrirSesionImpl } from "../../src/callables/abrir-sesion.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const areasCreadas: string[] = [];
const categoriasCreadas: string[] = [];
const sesionesCreadas: string[] = [];
const sucursalesCreadas: string[] = [];

afterEach(async () => {
  const sesionesPendientes = sesionesCreadas.splice(0);
  await Promise.all(sesionesPendientes.map((id) => db.recursiveDelete(db.doc(`sesiones/${id}`))));
  const sucursalesPendientes = sucursalesCreadas.splice(0);
  await Promise.all(sucursalesPendientes.map((id) => db.doc(`sucursales/${id}`).delete()));
  const categoriasPendientes = categoriasCreadas.splice(0);
  await Promise.all(categoriasPendientes.map((id) => db.doc(`categoriasValor/${id}`).delete()));
  const idsPendientes = areasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`areas/${id}`).delete()));
});

async function sembrarArea(activa = true) {
  const areaId = `area_${randomUUID()}`;
  await db.doc(`areas/${areaId}`).set({
    nombre: "Aseo",
    activa,
  });
  areasCreadas.push(areaId);
  return areaId;
}

async function sembrarCategoria(areaId: string, activa = true) {
  const categoriaId = `cat_${randomUUID()}`;
  await db.doc(`categoriasValor/${categoriaId}`).set({
    etiqueta: "Litro",
    valor: 1000,
    orden: 1,
    areaId,
    activa,
  });
  categoriasCreadas.push(categoriaId);
  return categoriaId;
}

async function sembrarSucursal() {
  const sucursalId = `suc_${randomUUID()}`;
  await db.doc(`sucursales/${sucursalId}`).set({
    nombre: "Sucursal áreas",
    direccion: "Dirección",
    conectividad: "wifi",
    activa: true,
    sesionAbiertaId: null,
  });
  sucursalesCreadas.push(sucursalId);
  return sucursalId;
}

describe("eliminarAreaImpl", () => {
  it("elimina físicamente un área sin categorías que la referencien (afirmativo)", async () => {
    const areaId = await sembrarArea();

    const resultado = await eliminarAreaImpl(db, "uid_admin", { areaId });

    expect(resultado.eliminada).toBe(true);
    const area = await db.doc(`areas/${areaId}`).get();
    expect(area.exists).toBe(false);
    areasCreadas.splice(areasCreadas.indexOf(areaId), 1);
  });

  it("emite AREA_ELIMINADA en la misma transacción", async () => {
    const areaId = await sembrarArea();

    await eliminarAreaImpl(db, "uid_admin", { areaId });
    areasCreadas.splice(areasCreadas.indexOf(areaId), 1);

    const eventos = await db
      .collection("auditoria")
      .where("areaId", "==", areaId)
      .where("tipo", "==", "AREA_ELIMINADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("areaId desconocido · rechaza not-found", async () => {
    await expect(
      eliminarAreaImpl(db, "uid_admin", {
        areaId: `area_inexistente_${randomUUID()}`,
      }),
    ).rejects.toThrow(HttpsError);
  });

  it("área referenciada por una categoría · rechaza failed-precondition y no la borra", async () => {
    const areaId = await sembrarArea();
    await sembrarCategoria(areaId);

    await expect(eliminarAreaImpl(db, "uid_admin", { areaId })).rejects.toThrow(
      /usada en 1 categoría/,
    );

    const area = await db.doc(`areas/${areaId}`).get();
    expect(area.exists).toBe(true);
  });

  it("área cuyo nombre sólo aparece congelado en una línea de sesión (sin categoriasValor.areaId) · SÍ es eliminable (I-7)", async () => {
    const areaId = await sembrarArea();
    await sembrarCategoria(areaId); // deja que abrirSesionImpl congele el nombre en la línea
    const sucursalId = await sembrarSucursal();
    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });
    sesionesCreadas.push(sesionId);

    const lineas = await db.collection(`sesiones/${sesionId}/lineas`).get();
    expect(lineas.docs.some((linea) => linea.get("area") === "Aseo")).toBe(true);

    // La única referencia viva (categoriasValor.areaId) se retira borrando la
    // categoría: así la línea congelada queda como la ÚNICA mención al área,
    // que es justo el escenario que este test regresiona.
    const categoriaId = categoriasCreadas.pop()!;
    await db.doc(`categoriasValor/${categoriaId}`).delete();

    const resultado = await eliminarAreaImpl(db, "uid_admin", { areaId });

    expect(resultado.eliminada).toBe(true);
    areasCreadas.splice(areasCreadas.indexOf(areaId), 1);
    const lineaDespues = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(lineaDespues.get("area")).toBe("Aseo");
  });
});
