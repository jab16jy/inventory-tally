import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import {
  exigirAdmin,
  exigirAdminDeSucursal,
  exigirCajeroDeAlcance,
  exigirCajeroObjetivo,
  exigirExclusivaDeSucursal,
} from "../../src/lib/exigir-admin.js";

if (getApps().length === 0) {
  initializeApp({ projectId: "demo-conteo-eficiente" });
}
const auth = getAuth();

const req = (auth: CallableRequest["auth"]) => ({ auth }) as CallableRequest;

const authDe = (rol: string, sucursales?: readonly string[]) =>
  ({ uid: "uid_x", token: { rol, sucursales } }) as unknown as CallableRequest["auth"];

describe("exigirAdmin (doc 08 §5)", () => {
  it("rechaza sin autenticación", () => {
    expect(() => exigirAdmin(req(undefined))).toThrow(HttpsError);
  });

  it("rechaza rol distinto de admin", () => {
    expect(() =>
      exigirAdmin(
        req({ uid: "uid_ana", token: { rol: "cajero" } } as unknown as CallableRequest["auth"]),
      ),
    ).toThrow(HttpsError);
  });

  it("permite rol admin", () => {
    expect(() =>
      exigirAdmin(
        req({ uid: "uid_admin", token: { rol: "admin" } } as unknown as CallableRequest["auth"]),
      ),
    ).not.toThrow();
  });
});

describe("exigirAdminDeSucursal (D1, S2a)", () => {
  it("rechaza sin autenticación", () => {
    expect(() => exigirAdminDeSucursal(req(undefined))).toThrow(HttpsError);
  });

  it("rechaza rol cajero", () => {
    expect(() => exigirAdminDeSucursal(req(authDe("cajero", ["suc_1"])))).toThrow(HttpsError);
  });

  it("permite rol admin y devuelve alcance null (Gerente, sin restricción)", () => {
    expect(exigirAdminDeSucursal(req(authDe("admin")))).toBeNull();
  });

  it("rechaza admin_sucursal con 0 sucursales en el claim (malformado)", () => {
    expect(() => exigirAdminDeSucursal(req(authDe("admin_sucursal", [])))).toThrow(HttpsError);
  });

  it("rechaza admin_sucursal con 2+ sucursales en el claim (malformado)", () => {
    expect(() => exigirAdminDeSucursal(req(authDe("admin_sucursal", ["suc_1", "suc_2"])))).toThrow(
      HttpsError,
    );
  });

  it("permite admin_sucursal con exactamente 1 sucursal y devuelve esa sucursal", () => {
    expect(exigirAdminDeSucursal(req(authDe("admin_sucursal", ["suc_1"])))).toBe("suc_1");
  });
});

describe("exigirExclusivaDeSucursal (D2, S2a)", () => {
  it("pasa cuando el recurso pertenece exactamente a la sucursal del alcance", () => {
    expect(() => exigirExclusivaDeSucursal("suc_1", ["suc_1"])).not.toThrow();
  });

  it("rechaza cuando el recurso no tiene sucursales (global/undefined)", () => {
    expect(() => exigirExclusivaDeSucursal("suc_1", undefined)).toThrow(HttpsError);
  });

  it("rechaza cuando el recurso pertenece a otra sucursal", () => {
    expect(() => exigirExclusivaDeSucursal("suc_1", ["suc_2"])).toThrow(HttpsError);
  });

  it("rechaza cuando el recurso está compartido con otra sucursal (2+)", () => {
    expect(() => exigirExclusivaDeSucursal("suc_1", ["suc_1", "suc_2"])).toThrow(HttpsError);
  });

  it("no aplica restricción para el alcance Gerente (null)", () => {
    expect(() => exigirExclusivaDeSucursal(null, undefined)).not.toThrow();
  });
});

describe("exigirCajeroDeAlcance (D3, S4-foundation)", () => {
  it("rechaza rol admin (anti-escalada)", () => {
    expect(() => exigirCajeroDeAlcance("suc_1", "admin", ["suc_1"])).toThrow(HttpsError);
  });

  it("rechaza rol admin_sucursal (anti-escalada)", () => {
    expect(() => exigirCajeroDeAlcance("suc_1", "admin_sucursal", ["suc_1"])).toThrow(HttpsError);
  });

  it("rechaza una sucursal ajena", () => {
    expect(() => exigirCajeroDeAlcance("suc_1", "cajero", ["suc_2"])).toThrow(HttpsError);
  });

  it("rechaza sucursales extra además de la propia", () => {
    expect(() => exigirCajeroDeAlcance("suc_1", "cajero", ["suc_1", "suc_2"])).toThrow(HttpsError);
  });

  it("permite rol cajero con exactamente la sucursal del alcance", () => {
    expect(() => exigirCajeroDeAlcance("suc_1", "cajero", ["suc_1"])).not.toThrow();
  });

  it("no aplica restricción para el alcance Gerente (null)", () => {
    expect(() => exigirCajeroDeAlcance(null, "admin", ["suc_1", "suc_2"])).not.toThrow();
  });
});

describe("exigirCajeroObjetivo (D3, S4-foundation)", () => {
  const uidsCreados: string[] = [];

  afterEach(async () => {
    await Promise.all(
      uidsCreados.splice(0).map((uid) => auth.deleteUser(uid).catch(() => undefined)),
    );
  });

  async function sembrarUsuarioAuth(rol: string, sucursales: readonly string[]) {
    const usuario = await auth.createUser({ email: `${randomUUID()}@negocio.com` });
    uidsCreados.push(usuario.uid);
    await auth.setCustomUserClaims(usuario.uid, { rol, sucursales });
    return usuario.uid;
  }

  it("no aplica restricción y NO lee Auth para el alcance Gerente (null)", async () => {
    // uid inexistente: si leyera Auth, `getUser` fallaría con auth/user-not-found.
    await expect(
      exigirCajeroObjetivo(auth, null, `uid_inexistente_${randomUUID()}`),
    ).resolves.toBeUndefined();
  });

  it("rechaza not-found cuando el uid objetivo no existe en Auth", async () => {
    await expect(
      exigirCajeroObjetivo(auth, "suc_1", `uid_inexistente_${randomUUID()}`),
    ).rejects.toThrow(HttpsError);
  });

  it("rechaza un objetivo con rol distinto de cajero", async () => {
    const uid = await sembrarUsuarioAuth("admin", ["suc_1"]);
    await expect(exigirCajeroObjetivo(auth, "suc_1", uid)).rejects.toThrow(HttpsError);
  });

  it("rechaza un objetivo cajero compartido con otra sucursal", async () => {
    const uid = await sembrarUsuarioAuth("cajero", ["suc_1", "suc_2"]);
    await expect(exigirCajeroObjetivo(auth, "suc_1", uid)).rejects.toThrow(HttpsError);
  });

  it("rechaza un objetivo cajero de otra sucursal", async () => {
    const uid = await sembrarUsuarioAuth("cajero", ["suc_2"]);
    await expect(exigirCajeroObjetivo(auth, "suc_1", uid)).rejects.toThrow(HttpsError);
  });

  it("permite un objetivo cajero de exactamente la sucursal del alcance", async () => {
    const uid = await sembrarUsuarioAuth("cajero", ["suc_1"]);
    await expect(exigirCajeroObjetivo(auth, "suc_1", uid)).resolves.toBeUndefined();
  });
});
