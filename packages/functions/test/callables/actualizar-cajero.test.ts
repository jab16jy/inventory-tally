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
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, vi } from "vitest";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";
import { actualizarCajeroImpl } from "../../src/callables/actualizar-cajero.js";

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
