// Puro, sin emulador: fabrica snapshots falsos con { exists, get }.
import { describe, expect, it } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import {
  autorizacionDe,
  exigirAdminOCajeroDeSesion,
} from "../../src/lib/exigir-cajero-de-sesion.js";

const req = (auth: CallableRequest["auth"]) => ({ auth }) as CallableRequest;

const admin = { uid: "uid_admin", rol: "admin", sucursales: [] as readonly string[] };
const cajero = (sucursales: readonly string[]) => ({
  uid: "uid_cajero",
  rol: "cajero",
  sucursales,
});

function snapshot(datos: {
  exists: boolean;
  estado?: string;
  sucursalId?: string;
}): DocumentSnapshot {
  return {
    exists: datos.exists,
    get: (campo: string) => (campo === "estado" ? datos.estado : datos.sucursalId),
  } as unknown as DocumentSnapshot;
}

describe("exigirAdminOCajeroDeSesion (A-3 / A-4 / I-6)", () => {
  it("admin con sesión abierta → pasa y devuelve el sucursalId de la sesión", () => {
    const sesion = snapshot({ exists: true, estado: "abierta", sucursalId: "suc_norte" });
    expect(exigirAdminOCajeroDeSesion(admin, sesion)).toEqual({ sucursalId: "suc_norte" });
  });

  it("admin con sesión de una sucursal que NO está en su claim → pasa igual (alcance global)", () => {
    const sesion = snapshot({ exists: true, estado: "abierta", sucursalId: "suc_ajena" });
    expect(exigirAdminOCajeroDeSesion(admin, sesion)).toEqual({ sucursalId: "suc_ajena" });
  });

  it("cajero con la sucursal en su claim y sesión abierta → pasa (I-6)", () => {
    const sesion = snapshot({ exists: true, estado: "abierta", sucursalId: "suc_norte" });
    expect(exigirAdminOCajeroDeSesion(cajero(["suc_norte"]), sesion)).toEqual({
      sucursalId: "suc_norte",
    });
  });

  it("cajero SIN esa sucursal en su claim → permission-denied (A-3)", () => {
    const sesion = snapshot({ exists: true, estado: "abierta", sucursalId: "suc_norte" });
    expect(() => exigirAdminOCajeroDeSesion(cajero(["suc_sur"]), sesion)).toThrow(HttpsError);
  });

  it("sesión cerrada → failed-precondition, también para el admin (A-4 no es por rol)", () => {
    const sesion = snapshot({ exists: true, estado: "cerrada", sucursalId: "suc_norte" });
    expect(() => exigirAdminOCajeroDeSesion(admin, sesion)).toThrow(HttpsError);
    expect(() => exigirAdminOCajeroDeSesion(cajero(["suc_norte"]), sesion)).toThrow(HttpsError);
  });

  it("snapshot inexistente → not-found", () => {
    const sesion = snapshot({ exists: false });
    expect(() => exigirAdminOCajeroDeSesion(admin, sesion)).toThrow(HttpsError);
  });

  it("orden de errores: not-found antes que failed-precondition antes que permission-denied", () => {
    const inexistente = snapshot({ exists: false });
    try {
      exigirAdminOCajeroDeSesion(cajero([]), inexistente);
      expect.fail("debía lanzar");
    } catch (error) {
      expect((error as HttpsError).code).toBe("not-found");
    }

    const cerrada = snapshot({ exists: true, estado: "cerrada", sucursalId: "suc_norte" });
    try {
      exigirAdminOCajeroDeSesion(cajero([]), cerrada);
      expect.fail("debía lanzar");
    } catch (error) {
      expect((error as HttpsError).code).toBe("failed-precondition");
    }

    const abierta = snapshot({ exists: true, estado: "abierta", sucursalId: "suc_norte" });
    try {
      exigirAdminOCajeroDeSesion(cajero([]), abierta);
      expect.fail("debía lanzar");
    } catch (error) {
      expect((error as HttpsError).code).toBe("permission-denied");
    }
  });

  it("autorizacionDe sin req.auth → unauthenticated", () => {
    expect(() => autorizacionDe(req(undefined))).toThrow(HttpsError);
  });

  it("claim con sucursales ausente o mal tipado se normaliza a [] sin reventar", () => {
    const sinSucursales = autorizacionDe(
      req({ uid: "uid_cajero", token: { rol: "cajero" } } as unknown as CallableRequest["auth"]),
    );
    expect(sinSucursales.sucursales).toEqual([]);

    const malTipado = autorizacionDe(
      req({
        uid: "uid_cajero",
        token: { rol: "cajero", sucursales: "suc_norte" },
      } as unknown as CallableRequest["auth"]),
    );
    expect(malTipado.sucursales).toEqual([]);

    const sesion = snapshot({ exists: true, estado: "abierta", sucursalId: "suc_norte" });
    expect(() => exigirAdminOCajeroDeSesion(malTipado, sesion)).toThrow(HttpsError);
  });
});
