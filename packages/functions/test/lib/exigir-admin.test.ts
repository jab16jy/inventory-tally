import { describe, expect, it } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import {
  exigirAdmin,
  exigirAdminDeSucursal,
  exigirExclusivaDeSucursal,
} from "../../src/lib/exigir-admin.js";

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
