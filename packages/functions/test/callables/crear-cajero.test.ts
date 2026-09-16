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
import type { CallableRequest } from "firebase-functions/v2/https";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CrearCajeroInput } from "@conteo/contracts";
import { crearCajero, crearCajeroImpl } from "../../src/callables/crear-cajero.js";

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

// Probado a través de `crearCajero.run(req)` (el wrapper `onCall`, D5) y no
// sólo de `crearCajeroImpl`: una callable que olvidara el gate de
// anti-escalada pasaría igual si sólo se probara el Impl directamente.
function reqCrearCajero(
  rol: string,
  sucursales: readonly string[] | undefined,
  correo: string,
  rolInput: "admin" | "admin_sucursal" | "cajero",
  sucursalesInput: readonly string[],
): CallableRequest<CrearCajeroInput> {
  return {
    data: {
      nombre: "Cajero Prueba",
      correo,
      passwordTemporal: "Temp2026#",
      rol: rolInput,
      sucursalesAsignadas: [...sucursalesInput],
    },
    auth: { uid: "uid_admin_sucursal", token: { rol, sucursales } },
  } as unknown as CallableRequest<CrearCajeroInput>;
}

describe("crearCajero — autorización de sucursal (D3, S4-crear)", () => {
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

  async function afirmarSinEfecto(correo: string): Promise<void> {
    await expect(auth.getUserByEmail(correo)).rejects.toThrow();
    const perfiles = await db.collection("usuarios").where("correo", "==", correo).get();
    expect(perfiles.size).toBe(0);
  }

  it("admin_sucursal crea un cajero de su propia sucursal (afirmativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const correo = `s4crear_${randomUUID()}@negocio.com`;

    const resultado = await crearCajero.run(
      reqCrearCajero("admin_sucursal", [sucursalId], correo, "cajero", [sucursalId]),
    );

    expect(resultado.creado).toBe(true);
    uidsCreados.push(resultado.uid);
    const usuarioAuth = await auth.getUser(resultado.uid);
    expect(usuarioAuth.customClaims).toEqual({ rol: "cajero", sucursales: [sucursalId] });
    const perfil = await db.doc(`usuarios/${resultado.uid}`).get();
    expect(perfil.get("activo")).toBe(true);
  });

  it("admin_sucursal que asigna rol admin es rechazado antes de escribir (negativo, anti-escalada)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const correo = `s4crear_${randomUUID()}@negocio.com`;

    await expect(
      crearCajero.run(
        reqCrearCajero("admin_sucursal", [sucursalId], correo, "admin", [sucursalId]),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await afirmarSinEfecto(correo);
  });

  it("admin_sucursal que asigna rol admin_sucursal es rechazado antes de escribir (negativo, anti-escalada)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const correo = `s4crear_${randomUUID()}@negocio.com`;

    await expect(
      crearCajero.run(
        reqCrearCajero("admin_sucursal", [sucursalId], correo, "admin_sucursal", [sucursalId]),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });

    await afirmarSinEfecto(correo);
  });

  it("admin_sucursal que asigna sucursal ajena o extra es rechazado antes de escribir (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const otraSucursalId = `suc_${randomUUID()}`;
    const correoAjena = `s4crear_${randomUUID()}@negocio.com`;
    const correoExtra = `s4crear_${randomUUID()}@negocio.com`;

    await expect(
      crearCajero.run(
        reqCrearCajero("admin_sucursal", [sucursalId], correoAjena, "cajero", [otraSucursalId]),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await afirmarSinEfecto(correoAjena);

    await expect(
      crearCajero.run(
        reqCrearCajero("admin_sucursal", [sucursalId], correoExtra, "cajero", [
          sucursalId,
          otraSucursalId,
        ]),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await afirmarSinEfecto(correoExtra);
  });

  it("claim malformado (0 o 2 sucursales) es rechazado antes de escribir (negativo)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const correoVacio = `s4crear_${randomUUID()}@negocio.com`;
    const correoDoble = `s4crear_${randomUUID()}@negocio.com`;

    await expect(
      crearCajero.run(reqCrearCajero("admin_sucursal", [], correoVacio, "cajero", [sucursalId])),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await afirmarSinEfecto(correoVacio);

    await expect(
      crearCajero.run(
        reqCrearCajero(
          "admin_sucursal",
          [sucursalId, `suc_${randomUUID()}`],
          correoDoble,
          "cajero",
          [sucursalId],
        ),
      ),
    ).rejects.toMatchObject({ code: "permission-denied" });
    await afirmarSinEfecto(correoDoble);
  });

  it("admin (Gerente) no se ve afectado por el alcance (regresión)", async () => {
    const sucursalId = `suc_${randomUUID()}`;
    const correo = `s4crear_${randomUUID()}@negocio.com`;

    const resultado = await crearCajero.run(
      reqCrearCajero("admin", undefined, correo, "cajero", [sucursalId]),
    );

    expect(resultado.creado).toBe(true);
    uidsCreados.push(resultado.uid);
  });
});
