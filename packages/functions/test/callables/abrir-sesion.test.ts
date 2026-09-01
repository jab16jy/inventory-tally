// Pruebas contra el emulador de Firestore (doc 08 §3: I-1, I-7).
//
// Igual que en on-aporte-escrito.test.ts: se prueba `abrirSesionImpl`
// directamente (sin el emulador de Functions) con un `uid` de ejecutor ya
// resuelto, exactamente lo que queda tras pasar `exigirAdmin`/`validar`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, vi } from "vitest";
import { abrirSesionImpl } from "../../src/callables/abrir-sesion.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

async function crearSucursal(sucursalId: string, sesionAbiertaId: string | null = null) {
  await db.doc(`sucursales/${sucursalId}`).set({ nombre: "Sucursal de prueba", sesionAbiertaId });
}

async function crearCategoria(
  categoriaId: string,
  valor: number,
  activa = true,
  sucursalesAsignadas?: readonly string[],
  areaId?: string,
) {
  await db.doc(`categoriasValor/${categoriaId}`).set({
    valor,
    etiqueta: `$${valor}`,
    activa,
    orden: 1,
    ...(sucursalesAsignadas !== undefined && { sucursalesAsignadas }),
    ...(areaId !== undefined && { areaId }),
  });
}

async function crearArea(areaId: string, nombre: string, activa = true) {
  await db.doc(`areas/${areaId}`).set({ nombre, activa });
}

describe("abrirSesionImpl", () => {
  it("I-1 · abre una sesión y marca sesionAbiertaId en la sucursal", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    await crearSucursal(sucursalId);
    await crearCategoria(`cat_${randomUUID()}`, 5000);

    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });

    const sesion = await db.doc(`sesiones/${sesionId}`).get();
    expect(sesion.get("estado")).toBe("abierta");
    expect(sesion.get("sucursalId")).toBe(sucursalId);

    const sucursal = await db.doc(`sucursales/${sucursalId}`).get();
    expect(sucursal.get("sesionAbiertaId")).toBe(sesionId);
  });

  it("I-1 · rechaza abrir una segunda sesión en una sucursal que ya tiene una abierta", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    await crearSucursal(sucursalId, "ses_ya_abierta");

    await expect(abrirSesionImpl(db, "uid_admin", { sucursalId })).rejects.toThrow(HttpsError);

    const sucursal = await db.doc(`sucursales/${sucursalId}`).get();
    expect(sucursal.get("sesionAbiertaId")).toBe("ses_ya_abierta"); // sin cambios
  });

  it("I-1 · dos aperturas concurrentes en la misma sucursal: sólo una gana (interleaving real)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    await crearSucursal(sucursalId);
    await crearCategoria(`cat_${randomUUID()}`, 5000);

    // Ambas transacciones leen `sesionAbiertaId: null` antes de que la
    // primera confirme; Firestore serializa por concurrencia optimista:
    // la perdedora reintenta, ve el `sesionAbiertaId` ya escrito por la
    // ganadora y falla por la misma guardia I-1 (línea 85), sin mocks.
    const resultados = await Promise.allSettled([
      abrirSesionImpl(db, "uid_admin", { sucursalId }),
      abrirSesionImpl(db, "uid_admin", { sucursalId }),
    ]);

    const ganadoras = resultados.filter((r) => r.status === "fulfilled");
    const rechazadas = resultados.filter((r) => r.status === "rejected");
    expect(ganadoras).toHaveLength(1);
    expect(rechazadas).toHaveLength(1);
    expect((rechazadas[0] as PromiseRejectedResult).reason).toBeInstanceOf(HttpsError);

    const sucursal = await db.doc(`sucursales/${sucursalId}`).get();
    const sesionGanadora = (ganadoras[0] as PromiseFulfilledResult<{ sesionId: string }>).value
      .sesionId;
    expect(sucursal.get("sesionAbiertaId")).toBe(sesionGanadora);
  });

  it("rechaza una sucursal inexistente", async () => {
    await expect(
      abrirSesionImpl(db, "uid_admin", { sucursalId: `suc_inexistente_${randomUUID()}` }),
    ).rejects.toThrow(HttpsError);
  });

  it("I-7 · siembra una línea por categoría activa con el valorUnitario copiado y congelado", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const catActivaId = `cat_${randomUUID()}`;
    const catInactivaId = `cat_${randomUUID()}`;
    await crearSucursal(sucursalId);
    await crearCategoria(catActivaId, 5000, true);
    await crearCategoria(catInactivaId, 10000, false);

    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });

    const lineaActiva = await db.doc(`sesiones/${sesionId}/lineas/${catActivaId}`).get();
    expect(lineaActiva.exists).toBe(true);
    expect(lineaActiva.get("valorUnitario")).toBe(5000);
    expect(lineaActiva.get("cantidadTotal")).toBe(0);

    const lineaInactiva = await db.doc(`sesiones/${sesionId}/lineas/${catInactivaId}`).get();
    expect(lineaInactiva.exists).toBe(false);

    // Congelado (I-7): cambiar el catálogo después no debe alterar la línea sembrada.
    await db.doc(`categoriasValor/${catActivaId}`).update({ valor: 999999 });
    const lineaTrasCambio = await db.doc(`sesiones/${sesionId}/lineas/${catActivaId}`).get();
    expect(lineaTrasCambio.get("valorUnitario")).toBe(5000);
  });

  it("D3 · revierte una siembra fallida: la sucursal queda libre y un segundo abrirSesion funciona", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    await crearSucursal(sucursalId);
    await crearCategoria(`cat_${randomUUID()}`, 5000);

    const fallo = new Error("fallo simulado de siembra");
    const batchEspia = vi.spyOn(db, "batch").mockImplementationOnce(() => {
      throw fallo;
    });

    await expect(abrirSesionImpl(db, "uid_admin", { sucursalId })).rejects.toThrow(fallo);
    batchEspia.mockRestore();

    const sucursalTrasFallo = await db.doc(`sucursales/${sucursalId}`).get();
    expect(sucursalTrasFallo.get("sesionAbiertaId")).toBeNull();

    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });
    const sesion = await db.doc(`sesiones/${sesionId}`).get();
    expect(sesion.get("estado")).toBe("abierta");
  });

  it("D4/D6 · siembra una categoría sin sucursalesAsignadas en cualquier sucursal (global, regresión)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const catId = `cat_${randomUUID()}`;
    await crearSucursal(sucursalId);
    await crearCategoria(catId, 5000); // sin sucursalesAsignadas

    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${catId}`).get();
    expect(linea.exists).toBe(true);
  });

  it("D4/D6 · siembra una categoría con sucursalesAsignadas sólo en las sucursales incluidas", async () => {
    const sucursalDentro = `suc_${randomUUID()}`;
    const sucursalFuera = `suc_${randomUUID()}`;
    const catId = `cat_${randomUUID()}`;
    await crearSucursal(sucursalDentro);
    await crearSucursal(sucursalFuera);
    await crearCategoria(catId, 15000, true, [sucursalDentro]);

    const { sesionId: sesionDentro } = await abrirSesionImpl(db, "uid_admin", {
      sucursalId: sucursalDentro,
    });
    const lineaDentro = await db.doc(`sesiones/${sesionDentro}/lineas/${catId}`).get();
    expect(lineaDentro.exists).toBe(true);

    const { sesionId: sesionFuera } = await abrirSesionImpl(db, "uid_admin", {
      sucursalId: sucursalFuera,
    });
    const lineaFuera = await db.doc(`sesiones/${sesionFuera}/lineas/${catId}`).get();
    expect(lineaFuera.exists).toBe(false);
  });

  it("I-7 · siembra la línea con el nombre de área copiado y congelado", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const areaId = `area_${randomUUID()}`;
    const catId = `cat_${randomUUID()}`;
    await crearSucursal(sucursalId);
    await crearArea(areaId, "Aseo");
    await crearCategoria(catId, 5000, true, undefined, areaId);

    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${catId}`).get();
    expect(linea.get("area")).toBe("Aseo");
  });

  it("I-7 · siembra la línea con 'Sin área' cuando la categoría no tiene areaId", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const catId = `cat_${randomUUID()}`;
    await crearSucursal(sucursalId);
    await crearCategoria(catId, 5000); // sin areaId

    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${catId}`).get();
    expect(linea.get("area")).toBe("Sin área");
  });

  it("registra un evento de auditoría SESION_ABIERTA", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    await crearSucursal(sucursalId);

    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });

    const eventos = await db.collection("auditoria").where("sesionId", "==", sesionId).get();
    expect(eventos.size).toBe(1);
    expect(eventos.docs[0]?.get("tipo")).toBe("SESION_ABIERTA");
  });
});
