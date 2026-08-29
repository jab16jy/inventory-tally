import { describe, expect, it } from "vitest";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { exigirReautenticacion } from "../../src/lib/exigir-reautenticacion.js";

const req = (authTime: number | undefined) =>
  ({
    auth:
      authTime === undefined
        ? undefined
        : ({
            uid: "uid_admin",
            token: { auth_time: authTime },
          } as unknown as CallableRequest["auth"]),
  }) as CallableRequest;

describe("exigirReautenticacion", () => {
  it("rechaza sin autenticación", () => {
    expect(() => exigirReautenticacion(req(undefined))).toThrow(HttpsError);
  });

  it("permite auth_time reciente (ahora mismo)", () => {
    expect(() => exigirReautenticacion(req(Date.now() / 1000))).not.toThrow();
  });

  it("permite auth_time justo dentro de la ventana de 5 minutos", () => {
    const dentroDeLaVentana = Date.now() / 1000 - 5 * 60 + 5;
    expect(() => exigirReautenticacion(req(dentroDeLaVentana))).not.toThrow();
  });

  it("rechaza auth_time más antiguo que la ventana de 5 minutos", () => {
    const fueraDeLaVentana = Date.now() / 1000 - 5 * 60 - 5;
    expect(() => exigirReautenticacion(req(fueraDeLaVentana))).toThrow(HttpsError);
  });
});
