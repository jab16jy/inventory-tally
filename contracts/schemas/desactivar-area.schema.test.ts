import { describe, expect, it } from "vitest";
import { desactivarAreaSchema } from "./desactivar-area.schema.js";

describe("desactivarAreaSchema (docs/plan-panel-administrador.md §3)", () => {
  it("acepta un areaId válido (afirmativo)", () => {
    const resultado = desactivarAreaSchema.safeParse({ areaId: "area_aseo" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza un areaId vacío (negativo)", () => {
    const resultado = desactivarAreaSchema.safeParse({ areaId: "" });
    expect(resultado.success).toBe(false);
  });
});
