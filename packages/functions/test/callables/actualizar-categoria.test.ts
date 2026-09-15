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
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import {
  actualizarCategoria,
  actualizarCategoriaImpl,
} from "../../src/callables/actualizar-categoria.js";
import type { ActualizarCategoriaInput } from "@conteo/contracts";

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

const sesionesCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = sesionesCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`sesiones/${id}`).delete()));
});

async function sembrarLineaDeSesion(
  sesionId: string,
  categoriaId: string,
  valorUnitario: number,
): Promise<void> {
  await db.doc(`sesiones/${sesionId}`).set({ estado: "abierta" });
  sesionesCreadas.push(sesionId);
  await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).set({
    categoriaId,
    valorUnitario,
    cantidadTotal: 0,
  });
}

describe("actualizarCategoriaImpl", () => {
  it("actualiza los campos editables y emite CATEGORIA_ACTUALIZADA en la misma transacción", async () => {
    const categoriaId = await sembrarCategoria();
    const etiquetaNueva = `Categoría ${randomUUID()}`;

    const resultado = await actualizarCategoriaImpl(
      db,
      "uid_admin",
      {
        categoriaId,
        etiqueta: etiquetaNueva,
        valor: 2000,
        orden: 2,
        areaIds: ["area_aseo", "area_bebidas"],
        sucursalesAsignadas: ["suc_norte"],
      },
      null,
    );

    expect(resultado.actualizada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("etiqueta")).toBe(etiquetaNueva);
    expect(categoria.get("valor")).toBe(2000);
    expect(categoria.get("orden")).toBe(2);
    expect(categoria.get("areaIds")).toEqual(["area_aseo", "area_bebidas"]);
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

    await actualizarCategoriaImpl(
      db,
      "uid_admin",
      {
        categoriaId,
        etiqueta: "Otra etiqueta",
        valor: 500,
        orden: 3,
      },
      null,
    );

    const despues = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(despues.get("activa")).toBe(false);
    expect(despues.get("creadaEn")).toEqual(creadaEnAntes);
  });

  it("falla con not-found si la categoría no existe", async () => {
    await expect(
      actualizarCategoriaImpl(
        db,
        "uid_admin",
        {
          categoriaId: `cat_inexistente_${randomUUID()}`,
          etiqueta: "Lo que sea",
          valor: 100,
          orden: 1,
        },
        null,
      ),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("borra areaIds/sucursalesAsignadas cuando la edición los omite (vuelve a categoría global)", async () => {
    const categoriaId = await sembrarCategoria({
      areaIds: ["area_aseo"],
      sucursalesAsignadas: ["suc_norte"],
    });

    await actualizarCategoriaImpl(
      db,
      "uid_admin",
      {
        categoriaId,
        etiqueta: "Global de nuevo",
        valor: 700,
        orden: 4,
      },
      null,
    );

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.data()).not.toHaveProperty("areaIds");
    expect(categoria.data()).not.toHaveProperty("sucursalesAsignadas");
  });

  it("I-7 (issue #67) · cambiar el valor no afecta la línea congelada de una sesión abierta", async () => {
    const categoriaId = await sembrarCategoria({ valor: 1000 });
    const sesionId = `ses_${randomUUID()}`;
    await sembrarLineaDeSesion(sesionId, categoriaId, 1000);

    await actualizarCategoriaImpl(
      db,
      "uid_admin",
      {
        categoriaId,
        etiqueta: "Precio subió a mitad de conteo",
        valor: 5000,
        orden: 1,
      },
      null,
    );

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("valorUnitario")).toBe(1000); // sin cambios, congelado al abrir
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("valor")).toBe(5000); // el catálogo sí cambió
  });
});

// Probado a través de `actualizarCategoria.run(req)` (el wrapper `onCall`,
// D5) y no sólo de `actualizarCategoriaImpl`: una callable que olvidara
// pasar el `alcance` pasaría igual si sólo se probara el Impl directamente.
function reqActualizarCategoria(
  rol: string,
  sucursales: readonly string[] | undefined,
  categoriaId: string,
  sucursalesAsignadas?: readonly string[],
  etiqueta: string = `Categoría ${randomUUID()}`,
): CallableRequest<ActualizarCategoriaInput> {
  return {
    // spread condicional: una clave presente con valor `undefined` no es lo
    // mismo para zod que la clave ausente — así se simula el payload real.
    data: {
      categoriaId,
      etiqueta,
      valor: 999,
      orden: 1,
      ...(sucursalesAsignadas !== undefined && { sucursalesAsignadas }),
    },
    auth: { uid: "uid_x", token: { rol, sucursales } },
  } as unknown as CallableRequest<ActualizarCategoriaInput>;
}

describe("actualizarCategoria — autorización de sucursal (D2, S3a)", () => {
  it("admin_sucursal actualiza una categoría de su exclusiva propiedad (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria({ sucursalesAsignadas: [sucursalId] });
    const etiquetaNueva = `Categoría ${randomUUID()}`;

    const resultado = await actualizarCategoria.run({
      data: {
        categoriaId,
        etiqueta: etiquetaNueva,
        valor: 1500,
        orden: 2,
        sucursalesAsignadas: [sucursalId],
      },
      auth: { uid: "uid_x", token: { rol: "admin_sucursal", sucursales: [sucursalId] } },
    } as unknown as CallableRequest<ActualizarCategoriaInput>);

    expect(resultado.actualizada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("etiqueta")).toBe(etiquetaNueva);
  });

  it(
    "admin_sucursal que omite sucursalesAsignadas al actualizar su propia categoría es " +
      "rechazado, sin cambios (negativo: el input omitido borraría el campo y la volvería " +
      "global — D2 exige la misma exclusividad que crearCategoria, no sólo la del valor guardado)",
    async () => {
      const sucursalId = `suc_${randomUUID()}`;
      const categoriaId = await sembrarCategoria({ sucursalesAsignadas: [sucursalId] });

      await expect(
        actualizarCategoria.run(
          reqActualizarCategoria("admin_sucursal", [sucursalId], categoriaId, undefined),
        ),
      ).rejects.toThrow(HttpsError);

      const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
      expect(categoria.get("sucursalesAsignadas")).toEqual([sucursalId]); // sin cambios
    },
  );

  it("admin_sucursal no puede actualizar una categoría global (negativo, sin cambios)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria();
    const etiquetaOriginal = (await db.doc(`categoriasValor/${categoriaId}`).get()).get("etiqueta");

    await expect(
      actualizarCategoria.run(
        reqActualizarCategoria("admin_sucursal", [sucursalId], categoriaId, [sucursalId]),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("etiqueta")).toBe(etiquetaOriginal);
  });

  it("admin_sucursal no puede actualizar una categoría compartida (negativo, sin cambios)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;
    const categoriaId = await sembrarCategoria({
      sucursalesAsignadas: [sucursalId, otraSucursalId],
    });
    const etiquetaOriginal = (await db.doc(`categoriasValor/${categoriaId}`).get()).get("etiqueta");

    await expect(
      actualizarCategoria.run(
        reqActualizarCategoria("admin_sucursal", [sucursalId], categoriaId, [sucursalId]),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("etiqueta")).toBe(etiquetaOriginal);
  });

  it("admin_sucursal con claim malformado (0 sucursales) es rechazado (negativo)", async () => {
    const categoriaId = await sembrarCategoria({ sucursalesAsignadas: [`suc_${randomUUID()}`] });

    await expect(
      actualizarCategoria.run(reqActualizarCategoria("admin_sucursal", [], categoriaId)),
    ).rejects.toThrow(HttpsError);
  });

  it("admin (Gerente) no se ve afectado (regresión)", async () => {
    const categoriaId = await sembrarCategoria();
    const etiquetaNueva = `Categoría ${randomUUID()}`;

    const resultado = await actualizarCategoria.run(
      reqActualizarCategoria("admin", undefined, categoriaId, undefined, etiquetaNueva),
    );

    expect(resultado.actualizada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${categoriaId}`).get();
    expect(categoria.get("etiqueta")).toBe(etiquetaNueva);
  });
});
