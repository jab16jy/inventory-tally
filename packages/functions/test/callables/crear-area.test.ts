// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `crearAreaSchema` ya tienen su propio test genérico,
// misma convención que `crearCategoria`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it, afterEach } from "vitest";
import { crearAreaImpl } from "../../src/callables/crear-area.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const areasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = areasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`areas/${id}`).delete()));
});

function datosValidos() {
  return {
    nombre: `Área ${randomUUID()}`,
  };
}

describe("crearAreaImpl", () => {
  it("crea el área activa (afirmativo, incluye admin procede)", async () => {
    const datos = datosValidos();

    const resultado = await crearAreaImpl(db, "uid_admin", datos);
    areasCreadas.push(resultado.areaId);

    expect(resultado.creada).toBe(true);
    const area = await db.doc(`areas/${resultado.areaId}`).get();
    expect(area.get("nombre")).toBe(datos.nombre);
    expect(area.get("activa")).toBe(true);
  });

  it("emite AREA_CREADA en la misma transacción", async () => {
    const resultado = await crearAreaImpl(db, "uid_admin", datosValidos());
    areasCreadas.push(resultado.areaId);

    const eventos = await db
      .collection("auditoria")
      .where("areaId", "==", resultado.areaId)
      .where("tipo", "==", "AREA_CREADA")
      .get();
    expect(eventos.size).toBe(1);
  });
});
