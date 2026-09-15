// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `reactivarCategoriaSchema` (alias de
// `desactivarCategoriaSchema`) ya tienen su propio test genérico, misma
// convención que `reactivarCajero`.
//
// RIESGO CRÍTICO (docs/plan-panel-administrador.md §6, riesgo 1):
// `categoriasValor` es una colección GLOBAL — cada test borra en `afterEach`
// toda categoría que sembró, para no filtrar estado hacia
// `abrir-sesion.test.ts` / `cerrar-sesion.test.ts` en la SIGUIENTE corrida.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import { desactivarCategoriaImpl } from "../../src/callables/desactivar-categoria.js";
import {
  reactivarCategoria,
  reactivarCategoriaImpl,
} from "../../src/callables/reactivar-categoria.js";
import type { ReactivarCategoriaInput } from "@conteo/contracts";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const categoriasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = categoriasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`categoriasValor/${id}`).delete()));
});

async function sembrarCategoria(activa: boolean, sucursalesAsignadas?: readonly string[]) {
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

describe("reactivarCategoriaImpl", () => {
  it("reactiva una categoría desactivada (afirmativo, incluye admin procede)", async () => {
    const categoriaId = await sembrarCategoria(true);
    await desactivarCategoriaImpl(db, "uid_admin", { categoriaId }, null);

    const resultado = await reactivarCategoriaImpl(db, "uid_admin", { categoriaId }, null);

    expect(resultado.reactivada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });

  it("emite CATEGORIA_REACTIVADA en la misma transacción", async () => {
    const categoriaId = await sembrarCategoria(true);
    await desactivarCategoriaImpl(db, "uid_admin", { categoriaId }, null);

    await reactivarCategoriaImpl(db, "uid_admin", { categoriaId }, null);

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", categoriaId)
      .where("tipo", "==", "CATEGORIA_REACTIVADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("categoriaId desconocido · rechaza not-found", async () => {
    await expect(
      reactivarCategoriaImpl(
        db,
        "uid_admin",
        { categoriaId: `cat_inexistente_${randomUUID()}` },
        null,
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("es idempotente sobre una categoría ya activa", async () => {
    const categoriaId = await sembrarCategoria(true);

    await expect(
      reactivarCategoriaImpl(db, "uid_admin", { categoriaId }, null),
    ).resolves.toMatchObject({
      categoriaId,
      reactivada: true,
    });
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });
});

// Probado a través de `reactivarCategoria.run(req)` (el wrapper `onCall`,
// D5) y no sólo de `reactivarCategoriaImpl`: una callable que olvidara pasar
// el `alcance` pasaría igual si sólo se probara el Impl directamente.
function reqReactivarCategoria(
  rol: string,
  sucursales: readonly string[] | undefined,
  categoriaId: string,
): CallableRequest<ReactivarCategoriaInput> {
  return {
    data: { categoriaId },
    auth: { uid: "uid_x", token: { rol, sucursales } },
  } as unknown as CallableRequest<ReactivarCategoriaInput>;
}

describe("reactivarCategoria — autorización de sucursal (D2, S3b)", () => {
  it("admin_sucursal reactiva una categoría de su exclusiva propiedad (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria(false, [sucursalId]);

    const resultado = await reactivarCategoria.run(
      reqReactivarCategoria("admin_sucursal", [sucursalId], categoriaId),
    );

    expect(resultado.reactivada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });

  it("admin_sucursal no puede reactivar una categoría global (negativo, sin cambios)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria(false);

    await expect(
      reactivarCategoria.run(reqReactivarCategoria("admin_sucursal", [sucursalId], categoriaId)),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(false);
  });

  it("admin_sucursal no puede reactivar una categoría compartida (negativo, sin cambios)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria(false, [sucursalId, otraSucursalId]);

    await expect(
      reactivarCategoria.run(reqReactivarCategoria("admin_sucursal", [sucursalId], categoriaId)),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(false);
  });

  it("admin_sucursal con claim malformado (0 sucursales) es rechazado, sin cambios (negativo)", async () => {
    const categoriaId = await sembrarCategoria(false, [`suc_${randomUUID()}`]);

    await expect(
      reactivarCategoria.run(reqReactivarCategoria("admin_sucursal", [], categoriaId)),
    ).rejects.toThrow(HttpsError);

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(false);
  });

  it("admin (Gerente) no se ve afectado (regresión)", async () => {
    const categoriaId = await sembrarCategoria(false);

    const resultado = await reactivarCategoria.run(
      reqReactivarCategoria("admin", undefined, categoriaId),
    );

    expect(resultado.reactivada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });
});
