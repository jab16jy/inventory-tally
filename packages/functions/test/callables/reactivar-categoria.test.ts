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
import { describe, expect, it, afterEach } from "vitest";
import { desactivarCategoriaImpl } from "../../src/callables/desactivar-categoria.js";
import { reactivarCategoriaImpl } from "../../src/callables/reactivar-categoria.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const categoriasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = categoriasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`categoriasValor/${id}`).delete()));
});

async function sembrarCategoria(activa: boolean) {
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

describe("reactivarCategoriaImpl", () => {
  it("reactiva una categoría desactivada (afirmativo, incluye admin procede)", async () => {
    const categoriaId = await sembrarCategoria(true);
    await desactivarCategoriaImpl(db, "uid_admin", { categoriaId });

    const resultado = await reactivarCategoriaImpl(db, "uid_admin", { categoriaId });

    expect(resultado.reactivada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });

  it("emite CATEGORIA_REACTIVADA en la misma transacción", async () => {
    const categoriaId = await sembrarCategoria(true);
    await desactivarCategoriaImpl(db, "uid_admin", { categoriaId });

    await reactivarCategoriaImpl(db, "uid_admin", { categoriaId });

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", categoriaId)
      .where("tipo", "==", "CATEGORIA_REACTIVADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("categoriaId desconocido · rechaza not-found", async () => {
    await expect(
      reactivarCategoriaImpl(db, "uid_admin", {
        categoriaId: `cat_inexistente_${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("es idempotente sobre una categoría ya activa", async () => {
    const categoriaId = await sembrarCategoria(true);

    await expect(reactivarCategoriaImpl(db, "uid_admin", { categoriaId })).resolves.toMatchObject({
      categoriaId,
      reactivada: true,
    });
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("activa")).toBe(true);
  });
});
