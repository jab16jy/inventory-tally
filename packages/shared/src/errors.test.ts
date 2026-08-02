import { describe, expect, it } from "vitest";
import {
  CantidadInvalidaError,
  CierreBloqueadoError,
  SesionCerradaError,
  SinConexionError,
  SinPermisoError,
} from "./errors.js";

describe("errores de dominio (doc 07 §8)", () => {
  it("SinPermisoError es un Error instanciable", () => {
    const error = new SinPermisoError("No tienes permiso sobre esta sucursal");
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("No tienes permiso sobre esta sucursal");
  });

  it("SesionCerradaError es un Error instanciable", () => {
    expect(new SesionCerradaError("cerrada")).toBeInstanceOf(Error);
  });

  it("CantidadInvalidaError es un Error instanciable", () => {
    expect(new CantidadInvalidaError("inválida")).toBeInstanceOf(Error);
  });

  it("SinConexionError es un Error instanciable", () => {
    expect(new SinConexionError("sin conexión")).toBeInstanceOf(Error);
  });

  it("CierreBloqueadoError expone la lista de cajeros sin confirmar", () => {
    const error = new CierreBloqueadoError(["Ana Ramírez", "Luis Pérez"]);
    expect(error).toBeInstanceOf(Error);
    expect(error.sinConfirmar).toEqual(["Ana Ramírez", "Luis Pérez"]);
    expect(error.message).toBe("Cierre bloqueado: hay cajeros sin sincronizar");
  });
});
