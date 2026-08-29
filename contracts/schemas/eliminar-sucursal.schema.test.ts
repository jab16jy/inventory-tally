import { describe, expect, it } from "vitest";
import { eliminarSucursalSchema } from "./eliminar-sucursal.schema.js";

describe("eliminarSucursalSchema (docs/plan-panel-administrador.md §3)", () => {
  it("acepta un sucursalId válido (afirmativo)", () => {
    const resultado = eliminarSucursalSchema.safeParse({ sucursalId: "sucursal_centro" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza cuando falta sucursalId (negativo)", () => {
    const resultado = eliminarSucursalSchema.safeParse({});
    expect(resultado.success).toBe(false);
  });

  it("rechaza un sucursalId vacío (negativo)", () => {
    const resultado = eliminarSucursalSchema.safeParse({ sucursalId: "" });
    expect(resultado.success).toBe(false);
  });
});
