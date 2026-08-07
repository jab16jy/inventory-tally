// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `crearSucursalSchema` ya tienen su propio test
// genérico, misma convención que `abrirSesion`/`desactivarCajero`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";
import { crearSucursalImpl } from "../../src/callables/crear-sucursal.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

function datosValidos() {
  return {
    nombre: `Sucursal ${randomUUID()}`,
    direccion: "Cra 1 # 2-3",
    conectividad: "wifi" as const,
  };
}

describe("crearSucursalImpl", () => {
  it("crea la sucursal activa y sin sesión abierta (afirmativo, incluye admin procede)", async () => {
    const datos = datosValidos();

    const resultado = await crearSucursalImpl(db, "uid_admin", datos);

    expect(resultado.creada).toBe(true);
    const sucursal = await db.doc(`sucursales/${resultado.sucursalId}`).get();
    expect(sucursal.get("nombre")).toBe(datos.nombre);
    expect(sucursal.get("activa")).toBe(true);
    expect(sucursal.get("sesionAbiertaId")).toBeNull();
  });

  it("emite SUCURSAL_CREADA en la misma transacción", async () => {
    const resultado = await crearSucursalImpl(db, "uid_admin", datosValidos());

    const eventos = await db
      .collection("auditoria")
      .where("sucursalId", "==", resultado.sucursalId)
      .where("tipo", "==", "SUCURSAL_CREADA")
      .get();
    expect(eventos.size).toBe(1);
  });
});
