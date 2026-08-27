import { describe, expect, it } from "vitest";
import { crearAreaSchema } from "./crear-area.schema.js";

const valido = {
  nombre: "Aseo",
};

describe("crearAreaSchema (docs/plan-panel-administrador.md §3)", () => {
  it("acepta un objeto válido (afirmativo)", () => {
    const resultado = crearAreaSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("rechaza nombre vacío (negativo)", () => {
    const resultado = crearAreaSchema.safeParse({ ...valido, nombre: "" });
    expect(resultado.success).toBe(false);
  });
});
