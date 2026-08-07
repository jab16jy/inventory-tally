import { describe, expect, it } from "vitest";
import { actualizarSucursalSchema } from "./actualizar-sucursal.schema.js";

const valido = {
  sucursalId: "suc_norte",
  nombre: "Sucursal Norte",
  direccion: "Cra 1 # 2-3",
  conectividad: "wifi",
  activa: true,
};

describe("actualizarSucursalSchema (docs/plan-panel-administrador.md §3: reemplazo total)", () => {
  it("acepta el objeto completo (afirmativo)", () => {
    const resultado = actualizarSucursalSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("rechaza conectividad fuera de wifi|datos (negativo)", () => {
    const resultado = actualizarSucursalSchema.safeParse({ ...valido, conectividad: "cable" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza nombre vacío (negativo)", () => {
    const resultado = actualizarSucursalSchema.safeParse({ ...valido, nombre: "" });
    expect(resultado.success).toBe(false);
  });

  it("no admite sesionAbiertaId: queda fuera del resultado aunque venga en la entrada (I-1)", () => {
    const resultado = actualizarSucursalSchema.safeParse({ ...valido, sesionAbiertaId: "ses_1" });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data).not.toHaveProperty("sesionAbiertaId");
    }
  });
});
