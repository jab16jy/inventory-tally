// Pruebas contra los emuladores de Firestore y Auth (docs/plan-panel-administrador.md
// §3). `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `eliminarCajeroSchema` ya tienen su propio test
// genérico, misma convención que `desactivarCajero`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EliminarCajeroInput } from "@conteo/contracts";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";
import { eliminarCajero, eliminarCajeroImpl } from "../../src/callables/eliminar-cajero.js";

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

// Probado a través de `eliminarCajero.run(req)` (el wrapper `onCall`, D5) y no
// sólo de `eliminarCajeroImpl`: un olvido del gate de sucursal pasaría igual
// si sólo se probara el Impl directamente.
describe("eliminarCajero — autorización de sucursal (D3, S4-eliminar)", () => {
  // Todo lo que crean los tests nuevos se borra aquí: sin huérfanos en Auth
  // ni perfiles/eventos/sesiones residuales para los demás archivos (emulador
  // compartido, `fileParallelism: false`).
  const uidsCreados: string[] = [];
  const sesionesCreadas: string[] = [];

  afterEach(async () => {
    for (const sesionId of sesionesCreadas.splice(0)) {
      await db
        .doc(`sesiones/${sesionId}`)
        .delete()
        .catch(() => undefined);
    }
    for (const uid of uidsCreados.splice(0)) {
      await auth.deleteUser(uid).catch(() => undefined);
      await db
        .doc(`usuarios/${uid}`)
        .delete()
        .catch(() => undefined);
      const eventos = await db.collection("auditoria").where("usuarioId", "==", uid).get();
      await Promise.all(eventos.docs.map((evento) => evento.ref.delete()));
    }
  });

  async function sembrarCajeroDe(sucursalesAsignadas: string[]): Promise<string> {
    const correo = `s4e_${randomUUID()}@negocio.com`;
    const resultado = await crearCajeroImpl(db, auth, "uid_admin", {
      nombre: "Cajero Objetivo",
      correo,
      passwordTemporal: "Temp2026#",
      rol: "cajero",
      sucursalesAsignadas,
    });
    uidsCreados.push(resultado.uid);
    return resultado.uid;
  }

  function reqEliminarCajero(
    rol: string,
    sucursales: readonly string[] | undefined,
    datos: EliminarCajeroInput,
  ): CallableRequest<EliminarCajeroInput> {
    return {
      data: datos,
      auth: { uid: "uid_admin_sucursal", token: { rol, sucursales } },
    } as unknown as CallableRequest<EliminarCajeroInput>;
  }

  it("admin_sucursal elimina un cajero de su propia sucursal (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);

    const resultado = await eliminarCajero.run(
      reqEliminarCajero("admin_sucursal", [sucursalId], { uid }),
    );

    expect(resultado.eliminado).toBe(true);
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.exists).toBe(false);
    await expect(auth.getUser(uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  });

  it("objetivo con custom claims admin/admin_sucursal es rechazado sin efectos (negativo, anti-escalada del objetivo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uidAdmin = await sembrarCajeroDe([sucursalId]);
    await auth.setCustomUserClaims(uidAdmin, { rol: "admin", sucursales: undefined });
    const uidAdminSucursal = await sembrarCajeroDe([sucursalId]);
    await auth.setCustomUserClaims(uidAdminSucursal, {
      rol: "admin_sucursal",
      sucursales: [sucursalId],
    });
    const borrar = vi.spyOn(auth, "deleteUser");

    await expect(
      eliminarCajero.run(reqEliminarCajero("admin_sucursal", [sucursalId], { uid: uidAdmin })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      eliminarCajero.run(
        reqEliminarCajero("admin_sucursal", [sucursalId], { uid: uidAdminSucursal }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(borrar).not.toHaveBeenCalled();
    const perfilAdmin = await db.doc(`usuarios/${uidAdmin}`).get();
    expect(perfilAdmin.exists).toBe(true);
    borrar.mockRestore();
  });

  it(
    "objetivo con sucursal compartida EN USO es rechazado sin efectos (negativo, D3: el gate " +
      "corre antes del count() de participaciones, para que un llamador rechazado nunca se " +
      "entere de cuántos conteos lo referencian)",
    async () => {
      const sucursalId = `suc_${randomUUID()}`;
      const otraSucursalId = `suc_${randomUUID()}`;
      const uid = await sembrarCajeroDe([sucursalId, otraSucursalId]);
      const sesionId = `ses_${randomUUID()}`;
      await db.doc(`sesiones/${sesionId}`).set({ estado: "abierta", participantes: [uid] });
      sesionesCreadas.push(sesionId);
      const borrar = vi.spyOn(auth, "deleteUser");

      await expect(
        eliminarCajero.run(reqEliminarCajero("admin_sucursal", [sucursalId], { uid })),
      ).rejects.toMatchObject({ code: "permission-denied" });

      expect(borrar).not.toHaveBeenCalled();
      const perfil = await db.doc(`usuarios/${uid}`).get();
      expect(perfil.exists).toBe(true);
      borrar.mockRestore();
    },
  );

  it("objetivo de sucursal ajena es rechazado sin efectos (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const foraneaId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([foraneaId]);
    const borrar = vi.spyOn(auth, "deleteUser");

    await expect(
      eliminarCajero.run(reqEliminarCajero("admin_sucursal", [sucursalId], { uid })),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(borrar).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.exists).toBe(true);
    borrar.mockRestore();
  });

  it("admin (Gerente) no se ve afectado por el alcance (regresión)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);

    const resultado = await eliminarCajero.run(reqEliminarCajero("admin", undefined, { uid }));

    expect(resultado.eliminado).toBe(true);
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.exists).toBe(false);
  });

  it(
    "objetivo huérfano (cuenta de Auth borrada, perfil de cajero remanente): admin_sucursal " +
      "recibe not-found y el perfil sobrevive (negativo, D3: el fallback de huérfanos de " +
      "eliminarCajeroImpl queda reservado al Gerente)",
    async () => {
      const sucursalId = `suc_${randomUUID()}`;
      const uid = await sembrarCajeroDe([sucursalId]);
      await auth.deleteUser(uid);

      await expect(
        eliminarCajero.run(reqEliminarCajero("admin_sucursal", [sucursalId], { uid })),
      ).rejects.toMatchObject({ code: "not-found" });

      expect((await db.doc(`usuarios/${uid}`).get()).exists).toBe(true);
    },
  );

  it("objetivo huérfano: el Gerente sigue pudiendo barrer el perfil remanente (regresión, D3)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);
    await auth.deleteUser(uid);

    const resultado = await eliminarCajero.run(reqEliminarCajero("admin", undefined, { uid }));

    expect(resultado.eliminado).toBe(true);
    expect((await db.doc(`usuarios/${uid}`).get()).exists).toBe(false);
  });
});
