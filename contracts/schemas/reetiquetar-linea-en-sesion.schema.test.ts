import { describe, expect, it } from "vitest";
import { reetiquetarLineaEnSesionSchema } from "./reetiquetar-linea-en-sesion.schema.js";

const valido = {
  sesionId: "ses_20260901_norte_01",
  categoriaId: "cat_1000",
  areaId: "area_aseo",
};

describe("reetiquetarLineaEnSesionSchema (ADR-22)", () => {
  it("acepta un objeto válido con areaId (afirmativo)", () => {
    const resultado = reetiquetarLineaEnSesionSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("acepta areaId omitido — vuelve a SIN_AREA (afirmativo)", () => {
    const resultado = reetiquetarLineaEnSesionSchema.safeParse({
      sesionId: valido.sesionId,
      categoriaId: valido.categoriaId,
    });
    expect(resultado.success).toBe(true);
  });

  it("acepta areaId null — vuelve a SIN_AREA explícitamente (afirmativo)", () => {
    // `nullish` trata `undefined` (omitido) y `null` (limpiado a propósito)
    // igual: ambos significan "sin área" para el cliente.
    const resultado = reetiquetarLineaEnSesionSchema.safeParse({ ...valido, areaId: null });
    expect(resultado.success).toBe(true);
  });

  it("rechaza sesionId vacío (negativo)", () => {
    const resultado = reetiquetarLineaEnSesionSchema.safeParse({ ...valido, sesionId: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza categoriaId vacío (negativo)", () => {
    const resultado = reetiquetarLineaEnSesionSchema.safeParse({ ...valido, categoriaId: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza areaId vacío (negativo, distinto de omitido/null)", () => {
    const resultado = reetiquetarLineaEnSesionSchema.safeParse({ ...valido, areaId: "" });
    expect(resultado.success).toBe(false);
  });
});
