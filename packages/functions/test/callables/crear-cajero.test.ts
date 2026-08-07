// Pruebas contra los emuladores de Firestore y Auth (spec gestion-cajeros, D-6:
// compensación en `crearCajero`). Se prueba `crearCajeroImpl` directamente, sin
// el emulador de Functions (misma convención que el resto del paquete).
//
// `unauthenticated`/`permission-denied`/entrada-inválida NO se reprueban aquí:
// `exigirAdmin` ya tiene su propio test genérico (`exigir-admin.test.ts`) y
// `crearCajeroSchema` el suyo (`crear-cajero.schema.test.ts`); `crearCajero`
// sólo los invoca en ese orden, igual que `abrirSesion`/`cerrarSesion` (que
// tampoco los reprueban en sus propios archivos). El caso "admin procede" queda
// cubierto por el primer test afirmativo de abajo.
import { randomUUID } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { crearCajeroImpl } from "../../src/callables/crear-cajero.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const db = getFirestore();
const auth = getAuth();

function datosValidos(correo: string) {
  return {
    nombre: "Ana Ramírez",
    correo,
    passwordTemporal: "Temp2026#",
    rol: "cajero" as const,
    sucursalesAsignadas: ["suc_norte"],
  };
}

describe("crearCajeroImpl", () => {
  it("entrada válida · crea usuario, claims, perfil activo y audita USUARIO_CREADO (afirmativo)", async () => {
    const correo = `ana_${randomUUID()}@negocio.com`;

    const resultado = await crearCajeroImpl(db, auth, "uid_admin", datosValidos(correo));

    expect(resultado.creado).toBe(true);
    const usuarioAuth = await auth.getUser(resultado.uid);
    expect(usuarioAuth.customClaims).toEqual({ rol: "cajero", sucursales: ["suc_norte"] });

    const perfil = await db.doc(`usuarios/${resultado.uid}`).get();
    expect(perfil.get("activo")).toBe(true);
    expect(perfil.get("correo")).toBe(correo);

    const eventos = await db
      .collection("auditoria")
      .where("usuarioId", "==", resultado.uid)
      .where("tipo", "==", "USUARIO_CREADO")
      .get();
    expect(eventos.size).toBe(1);
  });

  it("correo duplicado · rechaza con already-exists, sin crear un segundo perfil ni auditar de nuevo (negativo)", async () => {
    const correo = `dup_${randomUUID()}@negocio.com`;
    const primero = await crearCajeroImpl(db, auth, "uid_admin", datosValidos(correo));

    // El CÓDIGO importa, no sólo que lance: `onCall` traduce cualquier error
    // que no sea `HttpsError` a un `internal` genérico, así que un
    // `.rejects.toThrow()` a secas pasaría igual con el mapeo ausente y el
    // admin vería un fallo opaco en vez de "el correo ya está registrado".
    await expect(
      crearCajeroImpl(db, auth, "uid_admin", datosValidos(correo)),
    ).rejects.toMatchObject({ code: "already-exists" });

    const perfil = await db.doc(`usuarios/${primero.uid}`).get();
    expect(perfil.exists).toBe(true); // el original, sin tocar
    const eventos = await db
      .collection("auditoria")
      .where("usuarioId", "==", primero.uid)
      .where("tipo", "==", "USUARIO_CREADO")
      .get();
    expect(eventos.size).toBe(1); // ningún segundo evento
  });

  it("D-6 · falla tras crear el usuario en Auth: compensa con deleteUser y un reintento con el mismo correo funciona", async () => {
    const correo = `compensa_${randomUUID()}@negocio.com`;
    const espia = vi.spyOn(auth, "setCustomUserClaims").mockImplementationOnce(async () => {
      throw new Error("fallo simulado tras crear el usuario en Auth");
    });

    await expect(crearCajeroImpl(db, auth, "uid_admin", datosValidos(correo))).rejects.toThrow(
      "fallo simulado",
    );
    espia.mockRestore();

    // El correo quedó libre: ningún usuario huérfano sin claims.
    await expect(auth.getUserByEmail(correo)).rejects.toThrow();
    const perfiles = await db.collection("usuarios").where("correo", "==", correo).get();
    expect(perfiles.size).toBe(0);

    const reintento = await crearCajeroImpl(db, auth, "uid_admin", datosValidos(correo));
    expect(reintento.creado).toBe(true);
    const usuarioAuth = await auth.getUser(reintento.uid);
    expect(usuarioAuth.customClaims).toEqual({ rol: "cajero", sucursales: ["suc_norte"] });
  });
});
