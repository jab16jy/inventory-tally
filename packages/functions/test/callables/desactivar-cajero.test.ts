// Pruebas contra los emuladores de Firestore y Auth (spec gestion-cajeros).
//
// `unauthenticated`/`cajero-caller`/entrada inválida NO se reprueban aquí:
// `exigirAdmin` ya tiene su propio test genérico (`exigir-admin.test.ts`) y
// `desactivarCajeroSchema` el suyo (`desactivar-cajero.schema.test.ts`);
// `desactivarCajero` sólo los invoca en ese orden, misma convención que
// `crearCajero`/`cerrarSesion`/`actualizarCajero`. El caso "admin procede"
// queda cubierto por el primer test afirmativo de abajo.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DesactivarCajeroInput } from "@conteo/contracts";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";
import { desactivarCajero, desactivarCajeroImpl } from "../../src/callables/desactivar-cajero.js";

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

describe("desactivarCajeroImpl", () => {
  it("desactiva, revoca la sesión activa y audita (afirmativo, incluye admin procede)", async () => {
    const { uid } = await sembrarCajero();
    const revocar = vi.spyOn(auth, "revokeRefreshTokens");

    const resultado = await desactivarCajeroImpl(db, auth, "uid_admin", { uid });

    expect(resultado.desactivado).toBe(true);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.disabled).toBe(true);
    expect(revocar).toHaveBeenCalledWith(uid);

    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(false);

    const eventos = await db
      .collection("auditoria")
      .where("usuarioId", "==", uid)
      .where("tipo", "==", "USUARIO_DESACTIVADO")
      .get();
    expect(eventos.size).toBe(1);
    revocar.mockRestore();
  });

  it("uid desconocido · rechaza not-found", async () => {
    await expect(
      desactivarCajeroImpl(db, auth, "uid_admin", { uid: `uid_inexistente_${randomUUID()}` }),
    ).rejects.toThrow(HttpsError);
  });

  it("desactivar a un participante de una sesión abierta tiene éxito y no altera participantes (afirmativo)", async () => {
    const { uid } = await sembrarCajero();
    const sesionId = `ses_${randomUUID()}`;
    await db.doc(`sesiones/${sesionId}`).set({ estado: "abierta", participantes: [uid] });

    await desactivarCajeroImpl(db, auth, "uid_admin", { uid });

    const sesion = await db.doc(`sesiones/${sesionId}`).get();
    expect(sesion.get("participantes")).toEqual([uid]);
    expect(sesion.get("estado")).toBe("abierta");
  });
});

// Probado a través de `desactivarCajero.run(req)` (el wrapper `onCall`, D5) y no
// sólo de `desactivarCajeroImpl`: un olvido del gate de sucursal pasaría igual
// si sólo se probara el Impl directamente.
describe("desactivarCajero — autorización de sucursal (D3, S4-desactivar-reactivar)", () => {
  // Todo lo que crean los tests nuevos se borra aquí: sin huérfanos en Auth
  // ni perfiles/eventos residuales para los demás archivos (emulador
  // compartido, `fileParallelism: false`).
  const uidsCreados: string[] = [];

  afterEach(async () => {
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
    const correo = `s4dr_${randomUUID()}@negocio.com`;
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

  function reqDesactivarCajero(
    rol: string,
    sucursales: readonly string[] | undefined,
    datos: DesactivarCajeroInput,
  ): CallableRequest<DesactivarCajeroInput> {
    return {
      data: datos,
      auth: { uid: "uid_admin_sucursal", token: { rol, sucursales } },
    } as unknown as CallableRequest<DesactivarCajeroInput>;
  }

  it("admin_sucursal desactiva un cajero de su propia sucursal (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);

    const resultado = await desactivarCajero.run(
      reqDesactivarCajero("admin_sucursal", [sucursalId], { uid }),
    );

    expect(resultado.desactivado).toBe(true);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.disabled).toBe(true);
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
    const actualizar = vi.spyOn(auth, "updateUser");
    const revocar = vi.spyOn(auth, "revokeRefreshTokens");

    await expect(
      desactivarCajero.run(reqDesactivarCajero("admin_sucursal", [sucursalId], { uid: uidAdmin })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      desactivarCajero.run(
        reqDesactivarCajero("admin_sucursal", [sucursalId], { uid: uidAdminSucursal }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(actualizar).not.toHaveBeenCalled();
    expect(revocar).not.toHaveBeenCalled();
    const perfilAdmin = await db.doc(`usuarios/${uidAdmin}`).get();
    expect(perfilAdmin.get("activo")).toBe(true);
    actualizar.mockRestore();
    revocar.mockRestore();
  });

  it("objetivo con sucursal compartida es rechazado sin efectos (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId, otraSucursalId]);
    const actualizar = vi.spyOn(auth, "updateUser");

    await expect(
      desactivarCajero.run(reqDesactivarCajero("admin_sucursal", [sucursalId], { uid })),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(actualizar).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(true);
    actualizar.mockRestore();
  });

  it("objetivo de sucursal ajena es rechazado sin efectos (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const foraneaId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([foraneaId]);
    const actualizar = vi.spyOn(auth, "updateUser");

    await expect(
      desactivarCajero.run(reqDesactivarCajero("admin_sucursal", [sucursalId], { uid })),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(actualizar).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(true);
    actualizar.mockRestore();
  });

  it("claim del llamante malformado (0 o 2 sucursales) es rechazado antes de leer el objetivo (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);
    const objetivo = vi.spyOn(auth, "getUser");

    await expect(
      desactivarCajero.run(reqDesactivarCajero("admin_sucursal", [], { uid })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      desactivarCajero.run(
        reqDesactivarCajero("admin_sucursal", [sucursalId, `suc_${randomUUID()}`], { uid }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(objetivo).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(true);
    objetivo.mockRestore();
  });

  it("admin (Gerente) no se ve afectado por el alcance (regresión)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);

    const resultado = await desactivarCajero.run(reqDesactivarCajero("admin", undefined, { uid }));

    expect(resultado.desactivado).toBe(true);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.disabled).toBe(true);
  });
});
