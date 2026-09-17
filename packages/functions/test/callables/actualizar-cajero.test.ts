// Pruebas contra los emuladores de Firestore y Auth (spec gestion-cajeros,
// D-6: la revocación de tokens depende de comparar rol/sucursalesAsignadas
// enviados contra los almacenados, no de que el objeto llegue completo).
//
// `unauthenticated`/`cajero-caller`/entrada inválida NO se reprueban aquí:
// `exigirAdmin` ya tiene su propio test genérico (`exigir-admin.test.ts`) y
// `actualizarCajeroSchema` el suyo (`actualizar-cajero.schema.test.ts`);
// `actualizarCajero` sólo los invoca en ese orden, misma convención que
// `crearCajero`/`cerrarSesion` (que tampoco los reprueban en sus propios
// archivos). El caso "admin procede" queda cubierto por el primer test
// afirmativo de abajo.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActualizarCajeroInput } from "@conteo/contracts";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";
import { actualizarCajero, actualizarCajeroImpl } from "../../src/callables/actualizar-cajero.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();
const auth = getAuth();

async function sembrarCajero() {
  const correo = `cajero_${randomUUID()}@negocio.com`;
  return crearCajeroImpl(db, auth, "uid_admin", {
    nombre: "Ana Ramírez",
    correo,
    passwordTemporal: "Temp2026#",
    rol: "cajero",
    // Dos sucursales, no una: con una sola, un reordenamiento es indistinguible
    // de la igualdad y la comparación ordenada de `actualizarCajeroImpl` no
    // quedaría probada.
    sucursalesAsignadas: ["suc_norte", "suc_sur"],
  });
}

describe("actualizarCajeroImpl", () => {
  it("cambio de rol · reemplaza claims y revoca tokens (afirmativo, incluye admin procede)", async () => {
    const { uid } = await sembrarCajero();
    const revocar = vi.spyOn(auth, "revokeRefreshTokens");

    const resultado = await actualizarCajeroImpl(db, auth, "uid_admin", {
      uid,
      nombre: "Ana Ramírez",
      rol: "admin",
      sucursalesAsignadas: ["suc_norte", "suc_sur"],
    });

    expect(resultado.actualizado).toBe(true);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.customClaims).toEqual({
      rol: "admin",
      sucursales: ["suc_norte", "suc_sur"],
    });
    expect(revocar).toHaveBeenCalledWith(uid);

    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("rol")).toBe("admin");

    const eventos = await db
      .collection("auditoria")
      .where("usuarioId", "==", uid)
      .where("tipo", "==", "USUARIO_ACTUALIZADO")
      .get();
    expect(eventos.size).toBe(1);
    revocar.mockRestore();
  });

  it("sólo nombre, con las mismas sucursales reordenadas · no revoca tokens ni reemplaza claims (negativo, contraparte)", async () => {
    const { uid } = await sembrarCajero();
    const revocar = vi.spyOn(auth, "revokeRefreshTokens");
    const claims = vi.spyOn(auth, "setCustomUserClaims");

    await actualizarCajeroImpl(db, auth, "uid_admin", {
      uid,
      nombre: "Ana R. (actualizada)",
      rol: "cajero",
      // Mismo conjunto, orden invertido: la comparación ordena antes de
      // comparar, así que esto NO es un cambio y no debe forzar un nuevo
      // inicio de sesión. Sin el `.sort()` de la implementación, este test
      // falla.
      sucursalesAsignadas: ["suc_sur", "suc_norte"],
    });

    expect(revocar).not.toHaveBeenCalled();
    expect(claims).not.toHaveBeenCalled();
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.customClaims).toEqual({
      rol: "cajero",
      sucursales: ["suc_norte", "suc_sur"],
    });

    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("nombre")).toBe("Ana R. (actualizada)");
    revocar.mockRestore();
    claims.mockRestore();
  });

  it("uid desconocido · rechaza not-found", async () => {
    await expect(
      actualizarCajeroImpl(db, auth, "uid_admin", {
        uid: `uid_inexistente_${randomUUID()}`,
        nombre: "Nadie",
        rol: "cajero",
        sucursalesAsignadas: [],
      }),
    ).rejects.toThrow(HttpsError);
  });
});

// Probado a través de `actualizarCajero.run(req)` (el wrapper `onCall`, D5) y no
// sólo de `actualizarCajeroImpl`: un olvido del gate de sucursal pasaría igual
// si sólo se probara el Impl directamente.
describe("actualizarCajero — autorización de sucursal (D3, S4-actualizar)", () => {
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

  const NOMBRE_OBJETIVO = "Cajero Objetivo";

  async function sembrarCajeroDe(sucursalesAsignadas: string[]): Promise<string> {
    const correo = `s4act_${randomUUID()}@negocio.com`;
    const resultado = await crearCajeroImpl(db, auth, "uid_admin", {
      nombre: NOMBRE_OBJETIVO,
      correo,
      passwordTemporal: "Temp2026#",
      rol: "cajero",
      sucursalesAsignadas,
    });
    uidsCreados.push(resultado.uid);
    return resultado.uid;
  }

  function reqActualizarCajero(
    rol: string,
    sucursales: readonly string[] | undefined,
    datos: ActualizarCajeroInput,
  ): CallableRequest<ActualizarCajeroInput> {
    return {
      data: datos,
      auth: { uid: "uid_admin_sucursal", token: { rol, sucursales } },
    } as unknown as CallableRequest<ActualizarCajeroInput>;
  }

  it("admin_sucursal actualiza un cajero de su propia sucursal (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);

    const resultado = await actualizarCajero.run(
      reqActualizarCajero("admin_sucursal", [sucursalId], {
        uid,
        nombre: "Cajero Renombrado",
        rol: "cajero",
        sucursalesAsignadas: [sucursalId],
      }),
    );

    expect(resultado.actualizado).toBe(true);
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("nombre")).toBe("Cajero Renombrado");
  });

  it("admin_sucursal que asigna rol admin/admin_sucursal es rechazado antes de escribir (negativo, anti-escalada de entrada)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);
    const claims = vi.spyOn(auth, "setCustomUserClaims");
    const revocar = vi.spyOn(auth, "revokeRefreshTokens");

    await expect(
      actualizarCajero.run(
        reqActualizarCajero("admin_sucursal", [sucursalId], {
          uid,
          nombre: "Intento",
          rol: "admin",
          sucursalesAsignadas: [sucursalId],
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      actualizarCajero.run(
        reqActualizarCajero("admin_sucursal", [sucursalId], {
          uid,
          nombre: "Intento",
          rol: "admin_sucursal",
          sucursalesAsignadas: [sucursalId],
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(claims).not.toHaveBeenCalled();
    expect(revocar).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("nombre")).toBe(NOMBRE_OBJETIVO);
    claims.mockRestore();
    revocar.mockRestore();
  });

  // La otra mitad de la anti-escalada de entrada: el rol sigue siendo `cajero`,
  // así que sólo `exigirExclusivaDeSucursal` frena que un admin_sucursal le
  // agregue a su propio cajero el acceso a una sucursal ajena.
  it("admin_sucursal que amplía sucursalesAsignadas a una sucursal ajena es rechazado (negativo, anti-escalada de entrada)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const foraneaId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);
    const claims = vi.spyOn(auth, "setCustomUserClaims");

    await expect(
      actualizarCajero.run(
        reqActualizarCajero("admin_sucursal", [sucursalId], {
          uid,
          nombre: "Intento",
          rol: "cajero",
          sucursalesAsignadas: [sucursalId, foraneaId],
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(claims).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("sucursalesAsignadas")).toEqual([sucursalId]);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.customClaims).toEqual({ rol: "cajero", sucursales: [sucursalId] });
    claims.mockRestore();
  });

  it("objetivo con sucursal compartida es rechazado, perfil y claims intactos (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId, otraSucursalId]);
    const claims = vi.spyOn(auth, "setCustomUserClaims");

    await expect(
      actualizarCajero.run(
        reqActualizarCajero("admin_sucursal", [sucursalId], {
          uid,
          nombre: "Intento",
          rol: "cajero",
          sucursalesAsignadas: [sucursalId],
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(claims).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("nombre")).toBe(NOMBRE_OBJETIVO);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.customClaims).toEqual({
      rol: "cajero",
      sucursales: [sucursalId, otraSucursalId],
    });
    claims.mockRestore();
  });

  it("objetivo de sucursal ajena es rechazado antes de escribir (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const foraneaId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([foraneaId]);
    const claims = vi.spyOn(auth, "setCustomUserClaims");

    await expect(
      actualizarCajero.run(
        reqActualizarCajero("admin_sucursal", [sucursalId], {
          uid,
          nombre: "Intento",
          rol: "cajero",
          sucursalesAsignadas: [sucursalId],
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(claims).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("nombre")).toBe(NOMBRE_OBJETIVO);
    const usuarioAuth = await auth.getUser(uid);
    expect(usuarioAuth.customClaims).toEqual({ rol: "cajero", sucursales: [foraneaId] });
    claims.mockRestore();
  });

  it("claim del llamante malformado (0 o 2 sucursales) es rechazado antes de leer el objetivo (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);
    const objetivo = vi.spyOn(auth, "getUser");

    await expect(
      actualizarCajero.run(
        reqActualizarCajero("admin_sucursal", [], {
          uid,
          nombre: "Intento",
          rol: "cajero",
          sucursalesAsignadas: [sucursalId],
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await expect(
      actualizarCajero.run(
        reqActualizarCajero("admin_sucursal", [sucursalId, `suc_${randomUUID()}`], {
          uid,
          nombre: "Intento",
          rol: "cajero",
          sucursalesAsignadas: [sucursalId],
        }),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    expect(objetivo).not.toHaveBeenCalled();
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("nombre")).toBe(NOMBRE_OBJETIVO);
    objetivo.mockRestore();
  });

  it("admin (Gerente) no se ve afectado por el alcance (regresión)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const uid = await sembrarCajeroDe([sucursalId]);

    const resultado = await actualizarCajero.run(
      reqActualizarCajero("admin", undefined, {
        uid,
        nombre: "Renombrado por Gerente",
        rol: "cajero",
        sucursalesAsignadas: [sucursalId],
      }),
    );

    expect(resultado.actualizado).toBe(true);
    const perfil = await db.doc(`usuarios/${uid}`).get();
    expect(perfil.get("nombre")).toBe("Renombrado por Gerente");
  });
});
