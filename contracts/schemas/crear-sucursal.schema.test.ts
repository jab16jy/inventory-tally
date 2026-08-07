import { describe, expect, it } from "vitest";
import { crearSucursalSchema } from "./crear-sucursal.schema.js";

const valido = {
  nombre: "Sucursal Norte",
  direccion: "Cra 1 # 2-3",
  conectividad: "wifi",
};

describe("crearSucursalSchema (docs/plan-panel-administrador.md §3)", () => {
  it("acepta un objeto válido (afirmativo)", () => {
    const resultado = crearSucursalSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("rechaza conectividad fuera de wifi|datos (negativo)", () => {
    const resultado = crearSucursalSchema.safeParse({ ...valido, conectividad: "cable" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza nombre vacío (negativo)", () => {
    const resultado = crearSucursalSchema.safeParse({ ...valido, nombre: "" });
    expect(resultado.success).toBe(false);
  });
});
