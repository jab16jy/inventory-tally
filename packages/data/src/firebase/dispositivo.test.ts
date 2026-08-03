import { beforeEach, describe, expect, it } from "vitest";
import { obtenerIdDispositivo } from "./dispositivo.js";

describe("obtenerIdDispositivo", () => {
  beforeEach(() => {
    if (typeof localStorage !== "undefined") localStorage.clear();
  });

  it("devuelve el mismo id en llamadas sucesivas (estable por dispositivo)", () => {
    const primero = obtenerIdDispositivo();
    const segundo = obtenerIdDispositivo();
    expect(segundo).toBe(primero);
  });

  it("devuelve un string no vacío", () => {
    expect(obtenerIdDispositivo().length).toBeGreaterThan(0);
  });
});
