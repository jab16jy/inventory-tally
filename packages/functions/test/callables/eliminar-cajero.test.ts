// Pruebas contra los emuladores de Firestore y Auth (docs/plan-panel-administrador.md
// §3). `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin`, `exigirReautenticacion` y `eliminarCajeroSchema` ya
// tienen su propio test genérico, misma convención que `desactivarCajero`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it } from "vitest";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";
import { eliminarCajeroImpl } from "../../src/callables/eliminar-cajero.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();
const auth = getAuth();

async function sembrarCajero() {
  const correo = `cajero_${randomUUID()}@negocio.com`;
  return crearCajeroImpl(db, auth, "uid_admin", {
    nombre: "Luis Pérez",
    correo,
    passwordTemporal: "Temp2026#",
    rol: "cajero",
    sucursalesAsignadas: ["suc_norte"],
  });
}

async function sembrarAdmin() {
  const correo = `admin_${randomUUID()}@negocio.com`;
  return crearCajeroImpl(db, auth, "uid_admin", {
    nombre: "Ana Gómez",
    correo,
    passwordTemporal: "Temp2026#",
    rol: "admin",
    sucursalesAsignadas: [],
  });
}

describe("eliminarCajeroImpl", () => {
  it("elimina un cajero que nunca participó (afirmativo)", async () => {
    const { uid } = await sembrarCajero();

    const resultado = await eliminarCajeroImpl(db, auth, "uid_admin", { uid });

    expect(resultado.eliminado).toBe(true);
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.exists).toBe(false);
    await expect(auth.getUser(uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });

  it("emite USUARIO_ELIMINADO", async () => {
    const { uid } = await sembrarCajero();

    await eliminarCajeroImpl(db, auth, "uid_admin", { uid });

    const eventos = await db
      .collection("auditoria")
      .where("usuarioId", "==", uid)
      .where("tipo", "==", "USUARIO_ELIMINADO")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("uid desconocido · rechaza not-found", async () => {
    await expect(
      eliminarCajeroImpl(db, auth, "uid_admin", { uid: `uid_inexistente_${randomUUID()}` }),
    ).rejects.toThrow(HttpsError);
  });

  it("cajero listado en participantes de una sesión · rechaza failed-precondition y no lo borra", async () => {
    const { uid } = await sembrarCajero();
    const sesionId = `ses_${randomUUID()}`;
    await db.doc(`sesiones/${sesionId}`).set({ estado: "abierta", participantes: [uid] });

    await expect(eliminarCajeroImpl(db, auth, "uid_admin", { uid })).rejects.toThrow(
      /participó en 1 conteo/,
    );

    // La guarda debe correr ANTES de auth.deleteUser: si el código borrara
    // primero y lanzara después, este test seguiría pasando con sólo el
    // `rejects.toThrow` de arriba. Probar que la cuenta y el perfil
    // SOBREVIVEN es lo que detecta ese orden invertido.
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.uid).toBe(uid);
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.exists).toBe(true);

    await db.doc(`sesiones/${sesionId}`).delete();
    await auth.deleteUser(uid);
    await db.doc(`usuarios/${uid}`).delete();
  });

  it("el admin no puede eliminar su propia cuenta · rechaza y la cuenta sobrevive", async () => {
    const { uid } = await sembrarCajero();

    await expect(eliminarCajeroImpl(db, auth, uid, { uid })).rejects.toThrow(/tu propia cuenta/);

    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.uid).toBe(uid);

    await auth.deleteUser(uid);
    await db.doc(`usuarios/${uid}`).delete();
  });

  it("una cuenta con rol admin no es eliminable por esta callable · rechaza y sobrevive", async () => {
    const { uid } = await sembrarAdmin();

    await expect(eliminarCajeroImpl(db, auth, "uid_admin", { uid })).rejects.toThrow(
      /Sólo se pueden eliminar cajeros/,
    );

    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.customClaims?.rol).toBe("admin");
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.exists).toBe(true);

    await auth.deleteUser(uid);
    await db.doc(`usuarios/${uid}`).delete();
  });

  it("el propio USUARIO_CREADO del cajero no bloquea su eliminación (regresión de la no-guarda deliberada)", async () => {
    const { uid } = await sembrarCajero();
    const eventosCreacion = await db
      .collection("auditoria")
      .where("usuarioId", "==", uid)
      .where("tipo", "==", "USUARIO_CREADO")
      .get();
    expect(eventosCreacion.size).toBe(1);

    const resultado = await eliminarCajeroImpl(db, auth, "uid_admin", { uid });

    expect(resultado.eliminado).toBe(true);
  });

  it("perfil huérfano de un corte parcial · el reintento lo barre en vez de dar not-found", async () => {
    const { uid } = await sembrarCajero();
    // Reproduce el corte que documenta el orden Auth → Firestore: la cuenta
    // de Auth ya se borró, el perfil quedó. Si el reintento devolviera
    // not-found, ese perfil sería inalcanzable para siempre.
    await auth.deleteUser(uid);
    expect((await db.doc(`usuarios/${uid}`).get()).exists).toBe(true);

    const resultado = await eliminarCajeroImpl(db, auth, "uid_admin", { uid });

    expect(resultado.eliminado).toBe(true);
    expect((await db.doc(`usuarios/${uid}`).get()).exists).toBe(false);
  });

  it("perfil huérfano con rol admin · NO se barre por este endpoint", async () => {
    const { uid } = await sembrarAdmin();
    // Sin cuenta de Auth no quedan claims: el espejo es la única evidencia de
    // rol. Si no se consultara, este endpoint de cajeros borraría el perfil
    // de un admin.
    await auth.deleteUser(uid);

    await expect(eliminarCajeroImpl(db, auth, "uid_admin", { uid })).rejects.toThrow(
      /Sólo se pueden eliminar cajeros/,
    );
    expect((await db.doc(`usuarios/${uid}`).get()).exists).toBe(true);

    await db.doc(`usuarios/${uid}`).delete();
  });

  it("uid sin cuenta de Auth y sin perfil · sigue siendo not-found", async () => {
    await expect(
      eliminarCajeroImpl(db, auth, "uid_admin", { uid: `uid_fantasma_${randomUUID()}` }),
    ).rejects.toThrow(/Cajero inexistente/);
  });
});
