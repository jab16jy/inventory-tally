// Pruebas contra los emuladores de Firestore y Auth (docs/plan-panel-administrador.md
// §3). `unauthenticated`/`permission-denied`/entrada inválida NO se reprueban
// aquí: `exigirAdmin` y `reactivarCajeroSchema` (alias de
// `desactivarCajeroSchema`) ya tienen su propio test genérico, misma
// convención que `desactivarCajero`.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { type CallableRequest } from "firebase-functions/v2/https";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactivarCajeroInput } from "@conteo/contracts";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";
import { desactivarCajeroImpl } from "../../src/callables/desactivar-cajero.js";
import { reactivarCajero, reactivarCajeroImpl } from "../../src/callables/reactivar-cajero.js";

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

// Probado a través de `reactivarCajero.run(req)` (el wrapper `onCall`, D5) y no
// sólo de `reactivarCajeroImpl`: un olvido del gate de sucursal pasaría igual
// si sólo se probara el Impl directamente.
describe("reactivarCajero — autorización de sucursal (D3, S4-desactivar-reactivar)", () => {
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

  // Desactivado, no sólo creado: D3 confirma que `desactivarCajeroImpl` nunca
  // limpia claims, así que un cajero DESHABILITADO sigue teniendo
  // `rol: cajero` + `sucursales` — lo que hace que `exigirCajeroObjetivo`
  // funcione igual sobre un objetivo ya desactivado.
  async function sembrarCajeroDesactivadoDe(sucursalesAsignadas: string[]): Promise<string> {
    const correo = `s4dr_${randomUUID()}@negocio.com`;
    const resultado = await crearCajeroImpl(db, auth, "uid_admin", {
      nombre: "Cajero Objetivo",
      correo,
      passwordTemporal: "Temp2026#",
      rol: "cajero",
      sucursalesAsignadas,
    });
    uidsCreados.push(resultado.uid);
    await desactivarCajeroImpl(db, auth, "uid_admin", { uid: resultado.uid });
    return resultado.uid;
  }

  function reqReactivarCajero(
    rol: string,
    sucursales: readonly string[] | undefined,
    datos: ReactivarCajeroInput,
  ): CallableRequest<ReactivarCajeroInput> {
    return {
      data: datos,
      auth: { uid: "uid_admin_sucursal", token: { rol, sucursales } },
    } as unknown as CallableRequest<ReactivarCajeroInput>;
  }

  it("admin_sucursal reactiva un cajero desactivado de su propia sucursal (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDesactivadoDe([sucursalId]);

    const resultado = await reactivarCajero.run(
      reqReactivarCajero("admin_sucursal", [sucursalId], { uid }),
    );

    expect(resultado.reactivado).toBe(true);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.disabled).toBe(false);
    // Confirma la nota del diseño: el objetivo desactivado seguía teniendo
    // claims de cajero de su propia sucursal, por eso `exigirCajeroObjetivo`
    // lo admitió.
    expect(usuarioAuth.customClaims).toEqual({ rol: "cajero", sucursales: [sucursalId] });
  });

  it("objetivo con custom claims admin/admin_sucursal es rechazado sin efectos (negativo, anti-escalada del objetivo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uidAdmin = await sembrarCajeroDesactivadoDe([sucursalId]);
    await auth.setCustomUserClaims(uidAdmin, { rol: "admin", sucursales: undefined });
    const uidAdminSucursal = await sembrarCajeroDesactivadoDe([sucursalId]);
    await auth.setCustomUserClaims(uidAdminSucursal, {
      rol: "admin_sucursal",
      sucursales: [sucursalId],
    });
    const actualizar = vi.spyOn(auth, "updateUser");

    await expect(
      reactivarCajero.run(reqReactivarCajero("admin_sucursal", [sucursalId], { uid: uidAdmin })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      reactivarCajero.run(
        reqReactivarCajero("admin_sucursal", [sucursalId], { uid: uidAdminSucursal }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(actualizar).not.toHaveBeenCalled();
    const perfilAdmin = await db.doc(`usuarios/${uidAdmin}`).get();
    expect(perfilAdmin.get("activo")).toBe(false);
    actualizar.mockRestore();
  });

  it("objetivo con sucursal compartida es rechazado sin efectos (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDesactivadoDe([sucursalId, otraSucursalId]);
    const actualizar = vi.spyOn(auth, "updateUser");

    await expect(
      reactivarCajero.run(reqReactivarCajero("admin_sucursal", [sucursalId], { uid })),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(actualizar).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(false);
    actualizar.mockRestore();
  });

  it("objetivo de sucursal ajena es rechazado sin efectos (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const foraneaId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDesactivadoDe([foraneaId]);
    const actualizar = vi.spyOn(auth, "updateUser");

    await expect(
      reactivarCajero.run(reqReactivarCajero("admin_sucursal", [sucursalId], { uid })),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(actualizar).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(false);
    actualizar.mockRestore();
  });

  it("claim del llamante malformado (0 o 2 sucursales) es rechazado antes de leer el objetivo (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDesactivadoDe([sucursalId]);
    const objetivo = vi.spyOn(auth, "getUser");

    await expect(
      reactivarCajero.run(reqReactivarCajero("admin_sucursal", [], { uid })),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await expect(
      reactivarCajero.run(
        reqReactivarCajero("admin_sucursal", [sucursalId, `suc_${randomUUID()}`], { uid }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(objetivo).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("activo")).toBe(false);
    objetivo.mockRestore();
  });

  it("admin (Gerente) no se ve afectado por el alcance (regresión)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDesactivadoDe([sucursalId]);

    const resultado = await reactivarCajero.run(reqReactivarCajero("admin", undefined, { uid }));

    expect(resultado.reactivado).toBe(true);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.disabled).toBe(false);
  });
});
