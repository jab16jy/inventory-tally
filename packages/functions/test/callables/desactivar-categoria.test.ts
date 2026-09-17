// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `desactivarCategoriaSchema` ya tienen su propio test
// genérico, misma convención que `desactivarCajero`.
//
// RIESGO CRÍTICO (docs/plan-panel-administrador.md §6, riesgo 1):
// `categoriasValor` es una colección GLOBAL y `abrirSesionImpl` siembra una
// línea por cada doc con `activa == true` de TODA la colección, sin
// aislamiento por sufijo. Cada test borra en `afterEach` toda categoría que
// sembró, para no filtrar estado hacia `abrir-sesion.test.ts` /
// `cerrar-sesion.test.ts` en la SIGUIENTE corrida.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import {
  desactivarCategoria,
  desactivarCategoriaImpl,
} from "../../src/callables/desactivar-categoria.js";
import { abrirSesionImpl } from "../../src/callables/abrir-sesion.js";
import type { DesactivarCategoriaInput } from "@conteo/contracts";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const categoriasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = categoriasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`categoriasValor/${id}`).delete()));
});

async function sembrarCategoria(activa = true, sucursalesAsignadas?: readonly string[]) {
  const categoriaId = `cat_${randomUUID()}`;
  await db.doc(`categoriasValor/${categoriaId}`).set({
    etiqueta: "Litro",
    valor: 1000,
    orden: 1,
    activa,
    ...(sucursalesAsignadas !== undefined && { sucursalesAsignadas }),
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
  return sucursalId;
}

describe("desactivarCategoriaImpl", () => {
  it("desactiva la categoría (afirmativo, incluye admin procede)", async () => {
    const categoriaId = await sembrarCategoria();

    const resultado = await desactivarCategoriaImpl(db, "uid_admin", { categoriaId }, null);

    expect(resultado.desactivada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(false);
  });

  it("emite CATEGORIA_DESACTIVADA en la misma transacción", async () => {
    const categoriaId = await sembrarCategoria();

    await desactivarCategoriaImpl(db, "uid_admin", { categoriaId }, null);

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", categoriaId)
      .where("tipo", "==", "CATEGORIA_DESACTIVADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("categoriaId desconocido · rechaza not-found", async () => {
    await expect(
      desactivarCategoriaImpl(
        db,
        "uid_admin",
        { categoriaId: `cat_inexistente_${randomUUID()}` },
        null,
      ),
    ).rejects.toThrow(HttpsError);
  });

  it("no altera valorUnitario ni borra la línea de una sesión abierta (invariante I-7)", async () => {
    const categoriaId = await sembrarCategoria();
    const sucursalId = await sembrarSucursal();
    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });
    const lineaAntes = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(lineaAntes.exists).toBe(true);
    const valorUnitarioAntes = lineaAntes.get("valorUnitario");

    await desactivarCategoriaImpl(db, "uid_admin", { categoriaId }, null);

    const lineaDespues = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(lineaDespues.exists).toBe(true);
    expect(lineaDespues.get("valorUnitario")).toBe(valorUnitarioAntes);
  });
});

// Probado a través de `desactivarCategoria.run(req)` (el wrapper `onCall`,
// D5) y no sólo de `desactivarCategoriaImpl`: una callable que olvidara
// pasar el `alcance` pasaría igual si sólo se probara el Impl directamente.
function reqDesactivarCategoria(
  rol: string,
  sucursales: readonly string[] | undefined,
  categoriaId: string,
): CallableRequest<DesactivarCategoriaInput> {
  return {
    data: { categoriaId },
    auth: { uid: "uid_x", token: { rol, sucursales } },
  } as unknown as CallableRequest<DesactivarCategoriaInput>;
}

describe("desactivarCategoria — autorización de sucursal (D2, S3b)", () => {
  it("admin_sucursal desactiva una categoría de su exclusiva propiedad (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria(true, [sucursalId]);

    const resultado = await desactivarCategoria.run(
      reqDesactivarCategoria("admin_sucursal", [sucursalId], categoriaId),
    );

    expect(resultado.desactivada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(false);
  });

  it("admin_sucursal no puede desactivar una categoría global (negativo, sin cambios)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria(true);

    await expect(
      desactivarCategoria.run(reqDesactivarCategoria("admin_sucursal", [sucursalId], categoriaId)),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });

  it("admin_sucursal no puede desactivar una categoría compartida (negativo, sin cambios)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria(true, [sucursalId, otraSucursalId]);

    await expect(
      desactivarCategoria.run(reqDesactivarCategoria("admin_sucursal", [sucursalId], categoriaId)),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });

  it("admin_sucursal con claim malformado (0 sucursales) es rechazado, sin cambios (negativo)", async () => {
    const categoriaId = await sembrarCategoria(true, [`suc_${randomUUID()}`]);

    await expect(
      desactivarCategoria.run(reqDesactivarCategoria("admin_sucursal", [], categoriaId)),
    ).rejects.toThrow(HttpsError);

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });

  it("admin (Gerente) no se ve afectado (regresión)", async () => {
    const categoriaId = await sembrarCategoria(true);

    const resultado = await desactivarCategoria.run(
      reqDesactivarCategoria("admin", undefined, categoriaId),
    );

    expect(resultado.desactivada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(false);
  });
});
