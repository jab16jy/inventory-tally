// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `reactivarAreaSchema` (alias de `desactivarAreaSchema`)
// ya tienen su propio test genérico, misma convención que `reactivarCajero`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it, afterEach } from "vitest";
import { desactivarAreaImpl } from "../../src/callables/desactivar-area.js";
import { reactivarAreaImpl } from "../../src/callables/reactivar-area.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const areasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = areasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`areas/${id}`).delete()));
});

async function sembrarArea(activa: boolean) {
  const areaId = `area_${randomUUID()}`;
  await db.doc(`areas/${areaId}`).set({
    nombre: "Aseo",
    activa,
  });
  areasCreadas.push(areaId);
  return areaId;
}

describe("reactivarAreaImpl", () => {
  it("reactiva un área desactivada (afirmativo, incluye admin procede)", async () => {
    const areaId = await sembrarArea(true);
    await desactivarAreaImpl(db, "uid_admin", { areaId });

    const resultado = await reactivarAreaImpl(db, "uid_admin", { areaId });

    expect(resultado.reactivada).toBe(true);
    const area = await db.doc(`areas/${areaId}`).get();
    expect(area.get("activa")).toBe(true);
  });

  it("emite AREA_REACTIVADA en la misma transacción", async () => {
    const areaId = await sembrarArea(true);
    await desactivarAreaImpl(db, "uid_admin", { areaId });

    await reactivarAreaImpl(db, "uid_admin", { areaId });

    const eventos = await db
      .collection("auditoria")
      .where("areaId", "==", areaId)
      .where("tipo", "==", "AREA_REACTIVADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("areaId desconocido · rechaza not-found", async () => {
    await expect(
      reactivarAreaImpl(db, "uid_admin", {
        areaId: `area_inexistente_${randomUUID()}`,
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("es idempotente sobre un área ya activa", async () => {
    const areaId = await sembrarArea(true);

    await expect(reactivarAreaImpl(db, "uid_admin", { areaId })).resolves.toMatchObject({
      areaId,
      reactivada: true,
    });
    const area = await db.doc(`areas/${areaId}`).get();
    expect(area.get("activa")).toBe(true);
  });
});
