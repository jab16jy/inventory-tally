// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `actualizarCategoriaSchema` ya tienen su propio test
// genérico, misma convención que `actualizarArea`.
//
// Nombres/ids ÚNICOS por corrida (randomUUID): `categoriasValor` es GLOBAL y
// vitest corre los archivos de test en paralelo contra el MISMO emulador
// (mismo criterio que crear-categoria.test.ts/actualizar-area.test.ts).
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it, afterEach } from "vitest";
import { actualizarCategoriaImpl } from "../../src/callables/actualizar-categoria.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const categoriasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = categoriasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`categoriasValor/${id}`).delete()));
});

async function sembrarCategoria(overrides: Record<string, unknown> = {}) {
  const categoriaId = `cat_${randomUUID()}`;
  await db.doc(`categoriasValor/${categoriaId}`).set({
    etiqueta: `Categoría ${randomUUID()}`,
    valor: 1000,
    orden: 1,
    activa: true,
    creadaEn: new Date(),
    ...overrides,
  });
  categoriasCreadas.push(categoriaId);
  return categoriaId;
}

describe("actualizarCategoriaImpl", () => {
  it("actualiza los campos editables y emite CATEGORIA_ACTUALIZADA en la misma transacción", async () => {
    const categoriaId = await sembrarCategoria();
    const etiquetaNueva = `Categoría ${randomUUID()}`;

    const resultado = await actualizarCategoriaImpl(db, "uid_admin", {
      categoriaId,
      etiqueta: etiquetaNueva,
      valor: 2000,
      orden: 2,
      areaId: "area_aseo",
      sucursalesAsignadas: ["suc_norte"],
    });

    expect(resultado.actualizada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("etiqueta")).toBe(etiquetaNueva);
    expect(categoria.get("valor")).toBe(2000);
    expect(categoria.get("orden")).toBe(2);
    expect(categoria.get("areaId")).toBe("area_aseo");
    expect(categoria.get("sucursalesAsignadas")).toEqual(["suc_norte"]);

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", categoriaId)
      .where("tipo", "==", "CATEGORIA_ACTUALIZADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("no toca activa/creadaEn", async () => {
    const categoriaId = await sembrarCategoria({ activa: false });
    const antes = await db.doc(`categoriasValor/${categoriaId}`).get();
    const creadaEnAntes = antes.get("creadaEn");

    await actualizarCategoriaImpl(db, "uid_admin", {
      categoriaId,
      etiqueta: "Otra etiqueta",
      valor: 500,
      orden: 3,
    });

    const despues = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(despues.get("activa")).toBe(false);
    expect(despues.get("creadaEn")).toEqual(creadaEnAntes);
  });

  it("falla con not-found si la categoría no existe", async () => {
    await expect(
      actualizarCategoriaImpl(db, "uid_admin", {
        categoriaId: `cat_inexistente_${randomUUID()}`,
        etiqueta: "Lo que sea",
        valor: 100,
        orden: 1,
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("borra areaId/sucursalesAsignadas cuando la edición los omite (vuelve a categoría global)", async () => {
    const categoriaId = await sembrarCategoria({
      areaId: "area_aseo",
      sucursalesAsignadas: ["suc_norte"],
    });

    await actualizarCategoriaImpl(db, "uid_admin", {
      categoriaId,
      etiqueta: "Global de nuevo",
      valor: 700,
      orden: 4,
    });

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.data()).not.toHaveProperty("areaId");
    expect(categoria.data()).not.toHaveProperty("sucursalesAsignadas");
  });
});
