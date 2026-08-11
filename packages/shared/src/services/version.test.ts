import { describe, expect, it } from "vitest";
import { requiereActualizacion } from "./version.js";

describe("requiereActualizacion (issue #12 — bloqueo por versión mínima)", () => {
  it("actual igual a la mínima no requiere actualización", () => {
    expect(requiereActualizacion("1.2.3", "1.2.3")).toBe(false);
  });

  it("actual mayor que la mínima no requiere actualización", () => {
    expect(requiereActualizacion("1.3.0", "1.2.3")).toBe(false);
  });

  it("actual mayor solo en patch no requiere actualización", () => {
    expect(requiereActualizacion("1.2.4", "1.2.3")).toBe(false);
  });

  it("actual menor que la mínima sí requiere actualización", () => {
    expect(requiereActualizacion("1.2.2", "1.2.3")).toBe(true);
  });

  it("actual menor solo en major sí requiere actualización aunque minor/patch sean mayores", () => {
    // Comparación numérica por componente, no lexicográfica de string.
    expect(requiereActualizacion("1.20.0", "2.1.0")).toBe(true);
  });

  it("componentes de dos dígitos no se comparan como texto (10 > 9)", () => {
    expect(requiereActualizacion("1.10.0", "1.9.0")).toBe(false);
  });

  it("versión actual vacía bloquea (fail-closed)", () => {
    expect(requiereActualizacion("", "1.0.0")).toBe(true);
  });

  it("versión mínima vacía bloquea (fail-closed)", () => {
    expect(requiereActualizacion("1.0.0", "")).toBe(true);
  });

  it("versión actual con letras bloquea (fail-closed)", () => {
    expect(requiereActualizacion("1.2.x", "1.2.3")).toBe(true);
  });

  it("versión con menos de 3 componentes bloquea (fail-closed)", () => {
    expect(requiereActualizacion("1.2", "1.2.3")).toBe(true);
  });

  it("versión con más de 3 componentes bloquea (fail-closed)", () => {
    expect(requiereActualizacion("1.2.3.4", "1.2.3")).toBe(true);
  });

  it("versión con componente negativo bloquea (fail-closed)", () => {
    expect(requiereActualizacion("1.-2.3", "1.2.3")).toBe(true);
  });
});
