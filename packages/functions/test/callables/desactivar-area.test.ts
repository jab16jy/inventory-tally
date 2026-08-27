// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `desactivarAreaSchema` ya tienen su propio test
// genérico, misma convención que `desactivarCategoria`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, afterEach } from "vitest";
import { desactivarAreaImpl } from "../../src/callables/desactivar-area.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const areasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = areasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`areas/${id}`).delete()));
});

async function sembrarArea(activa = true) {
  const areaId = `area_${randomUUID()}`;
  await db.doc(`areas/${areaId}`).set({
    nombre: "Aseo",
    activa,
  });
  areasCreadas.push(areaId);
  return areaId;
}

describe("desactivarAreaImpl", () => {
  it("desactiva el área (afirmativo, incluye admin procede)", async () => {
    const areaId = await sembrarArea();

    const resultado = await desactivarAreaImpl(db, "uid_admin", { areaId });

    expect(resultado.desactivada).toBe(true);
    const area = await db.doc(`areas/${areaId}`).get();
    expect(area.get("activa")).toBe(false);
  });

  it("emite AREA_DESACTIVADA en la misma transacción", async () => {
    const areaId = await sembrarArea();

    await desactivarAreaImpl(db, "uid_admin", { areaId });

    const eventos = await db
      .collection("auditoria")
      .where("areaId", "==", areaId)
      .where("tipo", "==", "AREA_DESACTIVADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("areaId desconocido · rechaza not-found", async () => {
    await expect(
      desactivarAreaImpl(db, "uid_admin", {
        areaId: `area_inexistente_${randomUUID()}`,
      }),
    ).rejects.toThrow(HttpsError);
  });
});
