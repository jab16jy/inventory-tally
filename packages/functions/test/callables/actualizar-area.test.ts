// Pruebas contra el emulador de Firestore (docs/plan-panel-administrador.md §3).
// `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `actualizarAreaSchema` ya tienen su propio test
// genérico, misma convención que `actualizarSucursal`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it, afterEach } from "vitest";
import { actualizarAreaImpl } from "../../src/callables/actualizar-area.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();

const areasCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = areasCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`areas/${id}`).delete()));
});

// Nombres ÚNICOS por corrida (randomUUID), nunca literales como "Aseo": otros
// test files de esta suite (desactivar-area, eliminar-area, reactivar-area,
// abrir-sesion) siembran áreas activas con nombres fijos directamente por
// `.set()`, sin pasar por el guard de unicidad — y vitest corre los archivos
// de test en paralelo contra el MISMO emulador. Un nombre fijo aquí choca con
// esas áreas y da un falso "already-exists" (mismo criterio que
// crear-area.test.ts).
async function sembrarArea(nombre: string) {
  const areaId = `area_${randomUUID()}`;
  await db.doc(`areas/${areaId}`).set({ nombre, activa: true });
  areasCreadas.push(areaId);
  return areaId;
}

const sesionesCreadas: string[] = [];

afterEach(async () => {
  const idsPendientes = sesionesCreadas.splice(0);
  await Promise.all(idsPendientes.map((id) => db.doc(`sesiones/${id}`).delete()));
});

async function sembrarLineaDeSesion(
  sesionId: string,
  categoriaId: string,
  area: string,
): Promise<void> {
  await db.doc(`sesiones/${sesionId}`).set({ estado: "abierta" });
  sesionesCreadas.push(sesionId);
  await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).set({ categoriaId, area });
}

describe("actualizarAreaImpl", () => {
  it("actualiza el nombre y emite AREA_ACTUALIZADA en la misma transacción", async () => {
    const nombreOriginal = `Aseo ${randomUUID()}`;
    const areaId = await sembrarArea(nombreOriginal);
    const nombreNuevo = `Aseo y limpieza ${randomUUID()}`;

    const resultado = await actualizarAreaImpl(db, "uid_admin", {
      areaId,
      nombre: nombreNuevo,
    });

    expect(resultado.actualizada).toBe(true);
    const area = await db.doc(`areas/${areaId}`).get();
    expect(area.get("nombre")).toBe(nombreNuevo);

    const eventos = await db
      .collection("auditoria")
      .where("areaId", "==", areaId)
      .where("tipo", "==", "AREA_ACTUALIZADA")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("falla con not-found si el área no existe", async () => {
    await expect(
      actualizarAreaImpl(db, "uid_admin", {
        areaId: `area_inexistente_${randomUUID()}`,
        nombre: "Lo que sea",
      }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("rechaza renombrar a un nombre ya usado por OTRA área activa", async () => {
    const nombreOcupado = `Bebidas ${randomUUID()}`;
    await sembrarArea(nombreOcupado);
    const nombreOriginal = `Aseo ${randomUUID()}`;
    const areaId = await sembrarArea(nombreOriginal);

    await expect(
      actualizarAreaImpl(db, "uid_admin", { areaId, nombre: nombreOcupado }),
    ).rejects.toMatchObject({ code: "already-exists" });

    const area = await db.doc(`areas/${areaId}`).get();
    expect(area.get("nombre")).toBe(nombreOriginal); // sin cambios
  });

  it("renombrar al propio nombre actual NO es un falso positivo de duplicado", async () => {
    const nombreOriginal = `Aseo ${randomUUID()}`;
    const areaId = await sembrarArea(nombreOriginal);

    const resultado = await actualizarAreaImpl(db, "uid_admin", {
      areaId,
      nombre: nombreOriginal,
    });

    expect(resultado.actualizada).toBe(true);
  });

  it("I-7 (issue #67) · renombrar no afecta la línea congelada de una sesión abierta", async () => {
    const nombreOriginal = `Aseo ${randomUUID()}`;
    const areaId = await sembrarArea(nombreOriginal);
    const sesionId = `ses_${randomUUID()}`;
    const categoriaId = `cat_${randomUUID()}`;
    await sembrarLineaDeSesion(sesionId, categoriaId, nombreOriginal);

    await actualizarAreaImpl(db, "uid_admin", { areaId, nombre: "Aseo renombrada" });

    const linea = await db.doc(`sesiones/${sesionId}/lineas/${categoriaId}`).get();
    expect(linea.get("area")).toBe(nombreOriginal); // sin cambios, congelado al abrir
    const area = await db.doc(`areas/${areaId}`).get();
    expect(area.get("nombre")).toBe("Aseo renombrada"); // el catálogo sí cambió
  });
});
