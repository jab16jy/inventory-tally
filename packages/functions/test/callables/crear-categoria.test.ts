// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `crearCategoriaSchema` ya tienen su propio test
// genérico, misma convención que `crearSucursal`.
//
// RIESGO CRÍTICO (docs/plan-panel-administrador.md §6, riesgo 1):
// `categoriasValor` es una colección GLOBAL y `abrirSesionImpl` siembra una
// línea por cada doc con `activa == true` de TODA la colección, sin
// aislamiento por sufijo. Cada test borra en `afterEach` toda categoría que
// creó, para no filtrar una categoría activa hacia `abrir-sesion.test.ts` /
// `cerrar-sesion.test.ts` en la SIGUIENTE corrida.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import { crearCategoria, crearCategoriaImpl } from "../../src/callables/crear-categoria.js";
import { abrirSesionImpl } from "../../src/callables/abrir-sesion.js";
import { crearCategoriaSchema, type CrearCategoriaInput } from "@conteo/contracts";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const categoriasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = categoriasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`categoriasValor/${id}`).delete()));
});

function datosValidos() {
  return {
    etiqueta: `Categoría ${randomUUID()}`,
    valor: 1000,
    orden: 1,
  };
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

describe("crearCategoriaImpl", () => {
  it("crea la categoría activa (afirmativo, incluye admin procede)", async () => {
    const datos = datosValidos();

    const resultado = await crearCategoriaImpl(db, "uid_admin", datos);
    categoriasCreadas.push(resultado.categoriaId);

    expect(resultado.creada).toBe(true);
    const categoria = await db.doc(`categoriasValor/${resultado.categoriaId}`).get();
    expect(categoria.get("etiqueta")).toBe(datos.etiqueta);
    expect(categoria.get("valor")).toBe(datos.valor);
    expect(categoria.get("orden")).toBe(datos.orden);
    expect(categoria.get("activa")).toBe(true);
  });

  it("emite CATEGORIA_CREADA en la misma transacción", async () => {
    const resultado = await crearCategoriaImpl(db, "uid_admin", datosValidos());
    categoriasCreadas.push(resultado.categoriaId);

    const eventos = await db
      .collection("auditoria")
      .where("categoriaId", "==", resultado.categoriaId)
      .where("tipo", "==", "CATEGORIA_CREADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("no agrega líneas a una sesión ya abierta (invariante I-7)", async () => {
    const sucursalId = await sembrarSucursal();
    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });
    const antes = await db.collection(`sesiones/${sesionId}/lineas`).get();

    const resultado = await crearCategoriaImpl(db, "uid_admin", datosValidos());
    categoriasCreadas.push(resultado.categoriaId);

    const despues = await db.collection(`sesiones/${sesionId}/lineas`).get();
    expect(despues.size).toBe(antes.size);
  });

  it(
    "crea la categoría cuando el input viene de validar() sin sucursalesAsignadas " +
      "(regresión: zod deja la clave presente en undefined, Firestore rechaza escribirla tal cual)",
    async () => {
      // Simula exactamente lo que hace `validar()` en producción: parsear
      // con el schema, no construir el objeto a mano como `datosValidos()`.
      const datos = crearCategoriaSchema.parse(datosValidos());

      const resultado = await crearCategoriaImpl(db, "uid_admin", datos);
      categoriasCreadas.push(resultado.categoriaId);

      const categoria = await db.doc(`categoriasValor/${resultado.categoriaId}`).get();
      expect(categoria.exists).toBe(true);
      expect(categoria.data()).not.toHaveProperty("sucursalesAsignadas");
    },
  );

  it("crea la categoría con sucursalesAsignadas cuando se especifica (D4/D6: catálogo por sucursal)", async () => {
    const datos = crearCategoriaSchema.parse({
      ...datosValidos(),
      sucursalesAsignadas: ["suc_norte", "suc_centro"],
    });

    const resultado = await crearCategoriaImpl(db, "uid_admin", datos);
    categoriasCreadas.push(resultado.categoriaId);

    const categoria = await db.doc(`categoriasValor/${resultado.categoriaId}`).get();
    expect(categoria.get("sucursalesAsignadas")).toEqual(["suc_norte", "suc_centro"]);
  });

  it("crea la categoría con areaIds cuando se especifica (N:M)", async () => {
    const datos = crearCategoriaSchema.parse({
      ...datosValidos(),
      areaIds: ["area_aseo", "area_bebidas"],
    });

    const resultado = await crearCategoriaImpl(db, "uid_admin", datos);
    categoriasCreadas.push(resultado.categoriaId);

    const categoria = await db.doc(`categoriasValor/${resultado.categoriaId}`).get();
    expect(categoria.get("areaIds")).toEqual(["area_aseo", "area_bebidas"]);
  });
});

function reqCrearCategoria(
  rol: string,
  sucursales: readonly string[] | undefined,
  sucursalesAsignadas?: readonly string[],
): CallableRequest<CrearCategoriaInput> {
  return {
    // spread condicional: una clave presente con valor `undefined` no es lo
    // mismo para zod que la clave ausente (ver el test de regresión de
    // `crearCategoriaImpl` más arriba) — así se simula el payload real.
    data: { ...datosValidos(), ...(sucursalesAsignadas !== undefined && { sucursalesAsignadas }) },
    auth: { uid: "uid_x", token: { rol, sucursales } },
  } as unknown as CallableRequest<CrearCategoriaInput>;
}

describe("crearCategoria — autorización de sucursal (D2, S3a)", () => {
  it("admin_sucursal crea exactamente en su propia sucursal (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;

    const resultado = await crearCategoria.run(
      reqCrearCategoria("admin_sucursal", [sucursalId], [sucursalId]),
    );
    categoriasCreadas.push(resultado.categoriaId);

    const categoria = await db.doc(`categoriasValor/${resultado.categoriaId}`).get();
    expect(categoria.get("sucursalesAsignadas")).toEqual([sucursalId]);
  });

  it("admin_sucursal sin sucursalesAsignadas es rechazado, nada se crea (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const antes = await db.collection("categoriasValor").get();

    await expect(
      crearCategoria.run(reqCrearCategoria("admin_sucursal", [sucursalId], undefined)),
    ).rejects.toThrow(HttpsError);

    const despues = await db.collection("categoriasValor").get();
    expect(despues.size).toBe(antes.size);
  });

  it("admin_sucursal con sucursalesAsignadas multi-sucursal es rechazado (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;
    const antes = await db.collection("categoriasValor").get();

    await expect(
      crearCategoria.run(
        reqCrearCategoria("admin_sucursal", [sucursalId], [sucursalId, otraSucursalId]),
      ),
    ).rejects.toThrow(HttpsError);

    const despues = await db.collection("categoriasValor").get();
    expect(despues.size).toBe(antes.size);
  });

  it("admin_sucursal con claim malformado (2+ sucursales) es rechazado (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;

    await expect(
      crearCategoria.run(
        reqCrearCategoria("admin_sucursal", [sucursalId, otraSucursalId], [sucursalId]),
      ),
    ).rejects.toThrow(HttpsError);
  });

  it("admin (Gerente) puede crear una categoría global (regresión)", async () => {
    const resultado = await crearCategoria.run(reqCrearCategoria("admin", undefined, undefined));
    categoriasCreadas.push(resultado.categoriaId);

    const categoria = await db.doc(`categoriasValor/${resultado.categoriaId}`).get();
    expect(categoria.exists).toBe(true);
  });
});
