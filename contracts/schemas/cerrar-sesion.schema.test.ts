import { describe, expect, it } from "vitest";
import { cerrarSesionSchema } from "./cerrar-sesion.schema.js";

describe("cerrarSesionSchema (doc 08 §3)", () => {
  it("acepta una entrada válida con forzar explícito", () => {
    const resultado = cerrarSesionSchema.safeParse({
      sesionId: "ses_20260802_norte_01",
      forzar: false,
    });
    expect(resultado.success).toBe(true);
  });

  it("aplica forzar: false por defecto cuando se omite", () => {
    const resultado = cerrarSesionSchema.safeParse({ sesionId: "ses_20260802_norte_01" });
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.forzar).toBe(false);
    }
  });

  it("rechaza sesionId vacío", () => {
    const resultado = cerrarSesionSchema.safeParse({ sesionId: "", forzar: false });
    expect(resultado.success).toBe(false);
  });

  it("rechaza forzar que no es booleano", () => {
    const resultado = cerrarSesionSchema.safeParse({
      sesionId: "ses_20260802_norte_01",
      forzar: "true",
    });
    expect(resultado.success).toBe(false);
  });
});
