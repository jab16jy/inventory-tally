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
import { HttpsError } from "firebase-functions/v2/https";
import { describe, expect, it, vi } from "vitest";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";
import { desactivarCajeroImpl } from "../../src/callables/desactivar-cajero.js";

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
