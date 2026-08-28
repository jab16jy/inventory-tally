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

  it("rechaza un nombre ya usado por un área activa (evita que totalPorArea las fusione)", async () => {
    const datos = datosValidos();
    const primera = await crearAreaImpl(db, "uid_admin", datos);
    areasCreadas.push(primera.areaId);

    await expect(crearAreaImpl(db, "uid_admin", datos)).rejects.toThrow(
      "Ya existe un área activa con ese nombre",
    );
  });

  // El caso que el test secuencial de arriba NO puede cubrir: con la consulta
  // de duplicados fuera de la transacción, las dos llamadas leían antes de que
  // cualquiera escribiera, las dos veían `empty` y las dos creaban. La guarda
  // fallaba justo en el escenario contra el que existe.
  it("no deja crear dos áreas activas homónimas en llamadas concurrentes", async () => {
    const datos = datosValidos();

    const resultados = await Promise.allSettled([
      crearAreaImpl(db, "uid_admin", datos),
      crearAreaImpl(db, "uid_admin", datos),
    ]);

    // Se registran antes de afirmar nada: si la guarda fallara y se crearan
    // las dos, el afterEach igual las limpia y el test siguiente no hereda
    // basura.
    for (const r of resultados) {
      if (r.status === "fulfilled") areasCreadas.push(r.value.areaId);
    }

    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const activas = await db
      .collection("areas")
      .where("nombre", "==", datos.nombre)
      .where("activa", "==", true)
      .get();
    expect(activas.size).toBe(1);
  });
});
