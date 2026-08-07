// Pruebas contra los emuladores de Firestore y Auth (docs/plan-panel-administrador.md
// §3). `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `reactivarCajeroSchema` (alias de
// `desactivarCajeroSchema`) ya tienen su propio test genérico, misma
// convención que `desactivarCajero`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";
import { desactivarCajeroImpl } from "../../src/callables/desactivar-cajero.js";
import { reactivarCajeroImpl } from "../../src/callables/reactivar-cajero.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();
const auth = getAuth();

async function sembrarCajeroDesactivado() {
  const correo = `cajero_${randomUUID()}@negocio.com`;
  const { uid } = await crearCajeroImpl(db, auth, "uid_admin", {
    nombre: "Luis Pérez",
    correo,
    passwordTemporal: "Temp2026#",
    rol: "cajero",
    sucursalesAsignadas: ["suc_norte"],
  });
  await desactivarCajeroImpl(db, auth, "uid_admin", { uid });
  return uid;
}

describe("reactivarCajeroImpl", () => {
  it("marca activo:true y habilita al cajero en Auth (afirmativo, incluye admin procede)", async () => {
    const uid = await sembrarCajeroDesactivado();

    const resultado = await reactivarCajeroImpl(db, auth, "uid_admin", { uid });

    expect(resultado.reactivado).toBe(true);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.disabled).toBe(false);
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(true);
  });

  it("registra USUARIO_ACTUALIZADO nombrando el campo que cambió", async () => {
    const uid = await sembrarCajeroDesactivado();

    await reactivarCajeroImpl(db, auth, "uid_admin", { uid });

    const eventos = await db
      .collection("auditoria")
      .where("usuarioId", "==", uid)
      .where("tipo", "==", "USUARIO_ACTUALIZADO")
      .get();
    expect(eventos.size).toBe(1);
    // Sin `campos`, este evento es indistinguible del que emite
    // actualizarCajero al renombrar: la auditoría no podría explicar
    // que lo que ocurrió fue una reactivación.
    expect(eventos.docs[0]!.get("campos")).toEqual(["activo"]);
  });

  it("falla con not-found si el uid no existe", async () => {
    await expect(
      reactivarCajeroImpl(db, auth, "uid_admin", { uid: `uid_inexistente_${randomUUID()}` }),
    ).rejects.toMatchObject({ code: "not-found" });
  });

  it("es idempotente sobre un cajero ya activo", async () => {
    const correo = `cajero_${randomUUID()}@negocio.com`;
    const { uid } = await crearCajeroImpl(db, auth, "uid_admin", {
      nombre: "Ana Ramírez",
      correo,
      passwordTemporal: "Temp2026#",
      rol: "cajero",
      sucursalesAsignadas: ["suc_norte"],
    });

    await expect(reactivarCajeroImpl(db, auth, "uid_admin", { uid })).resolves.toMatchObject({
      uid,
      reactivado: true,
    });
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(true);
  });

  it("invariante: un corte entre Firestore y Auth nunca deja a un cajero activo en Auth con activo:false en Firestore", async () => {
    // Firestore se escribe PRIMERO (docs/plan-panel-administrador.md §3): si
    // `auth.updateUser` fallara después, el peor estado posible es
    // `activo:true` en Firestore con Auth aún deshabilitado (bloquea el
    // login, pero sigue contando para el cierre) — nunca al revés.
    const uid = await sembrarCajeroDesactivado();

    const fallo = new Error("fallo simulado en auth.updateUser");
    const espia = vi.spyOn(auth, "updateUser").mockImplementationOnce(async () => {
      throw fallo;
    });

    await expect(reactivarCajeroImpl(db, auth, "uid_admin", { uid })).rejects.toThrow(fallo);
    espia.mockRestore();

    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(true); // Firestore ya se escribió

    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.disabled).toBe(true); // Auth queda pendiente, no al revés
  });
});
