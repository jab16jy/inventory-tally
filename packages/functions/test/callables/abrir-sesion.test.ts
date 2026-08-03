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

async function crearCategoria(categoriaId: string, valor: number, activa = true) {
  await db
    .doc(`categoriasValor/${categoriaId}`)
    .set({ valor, etiqueta: `$${valor}`, activa, orden: 1 });
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

  it("registra un evento de auditoría SESION_ABIERTA", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    await crearSucursal(sucursalId);

    const { sesionId } = await abrirSesionImpl(db, "uid_admin", { sucursalId });

    const eventos = await db.collection("auditoria").where("sesionId", "==", sesionId).get();
    expect(eventos.size).toBe(1);
    expect(eventos.docs[0]?.get("tipo")).toBe("SESION_ABIERTA");
  });
});
