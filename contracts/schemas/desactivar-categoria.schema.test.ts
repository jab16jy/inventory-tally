import { describe, expect, it } from "vitest";
import { desactivarCategoriaSchema } from "./desactivar-categoria.schema.js";

describe("desactivarCategoriaSchema (docs/plan-panel-administrador.md §3)", () => {
  it("acepta un categoriaId válido (afirmativo)", () => {
    const resultado = desactivarCategoriaSchema.safeParse({ categoriaId: "cat_litro" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza un categoriaId vacío (negativo)", () => {
    const resultado = desactivarCategoriaSchema.safeParse({ categoriaId: "" });
    expect(resultado.success).toBe(false);
  });
});
