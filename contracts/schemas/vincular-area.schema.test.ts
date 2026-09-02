import { describe, expect, it } from "vitest";
import { vincularAreaSchema } from "./vincular-area.schema.js";

const valido = {
  sesionId: "ses_20260901_norte_01",
  categoriaId: "cat_1000",
  areaId: "area_efectivo",
};

describe("vincularAreaSchema (doc 08 §3)", () => {
  it("acepta un objeto válido (afirmativo)", () => {
    const resultado = vincularAreaSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("rechaza sesionId vacío (negativo)", () => {
    const resultado = vincularAreaSchema.safeParse({ ...valido, sesionId: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza categoriaId vacío (negativo)", () => {
    const resultado = vincularAreaSchema.safeParse({ ...valido, categoriaId: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza areaId vacío (negativo)", () => {
    // `areaId` es requerido aquí, a diferencia de crearCategoriaSchema donde
    // es opcional: esta callable existe SÓLO para vincular, así que sin área
    // no hay operación que hacer.
    const resultado = vincularAreaSchema.safeParse({ ...valido, areaId: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza el objeto sin areaId (negativo)", () => {
    const resultado = vincularAreaSchema.safeParse({
      sesionId: valido.sesionId,
      categoriaId: valido.categoriaId,
    });
    expect(resultado.success).toBe(false);
  });
});
