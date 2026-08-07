// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `actualizarSucursalSchema` ya tienen su propio test
// genérico, misma convención que `actualizarCajero`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { actualizarSucursalImpl } from "../../src/callables/actualizar-sucursal.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

async function sembrarSucursal(sesionAbiertaId: string | null = null) {
  const sucursalId = `suc_${randomUUID()}`;
  await db.doc(`sucursales/${sucursalId}`).set({
    nombre: "Sucursal vieja",
    direccion: "Dirección vieja",
    conectividad: "datos",
    activa: true,
    sesionAbiertaId,
  });
  return sucursalId;
}

describe("actualizarSucursalImpl", () => {
  it("actualiza nombre, dirección y conectividad (afirmativo, incluye admin procede)", async () => {
    const sucursalId = await sembrarSucursal();

    const resultado = await actualizarSucursalImpl(db, "uid_admin", {
      sucursalId,
      nombre: "Sucursal nueva",
      direccion: "Dirección nueva",
      conectividad: "wifi",
      activa: true,
    });

    expect(resultado.actualizada).toBe(true);
    const sucursal = await db.doc(`sucursales/${sucursalId}`).get();
    expect(sucursal.get("nombre")).toBe("Sucursal nueva");
    expect(sucursal.get("direccion")).toBe("Dirección nueva");
    expect(sucursal.get("conectividad")).toBe("wifi");

    const eventos = await db
      .collection("auditoria")
      .where("sucursalId", "==", sucursalId)
      .where("tipo", "==", "SUCURSAL_ACTUALIZADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("rechaza desactivar una sucursal con sesión abierta", async () => {
    const sucursalId = await sembrarSucursal("ses_ya_abierta");

    await expect(
      actualizarSucursalImpl(db, "uid_admin", {
        sucursalId,
        nombre: "Sucursal nueva",
        direccion: "Dirección nueva",
        conectividad: "wifi",
        activa: false,
      }),
    ).rejects.toMatchObject({ code: "failed-precondition" });

    const sucursal = await db.doc(`sucursales/${sucursalId}`).get();
    expect(sucursal.get("activa")).toBe(true); // sin cambios
  });

  it("falla con not-found si la sucursal no existe", async () => {
    await expect(
      actualizarSucursalImpl(db, "uid_admin", {
        sucursalId: `suc_inexistente_${randomUUID()}`,
        nombre: "Sucursal nueva",
        direccion: "Dirección nueva",
        conectividad: "wifi",
        activa: true,
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });
});
