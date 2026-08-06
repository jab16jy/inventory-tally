import { describe, expect, it } from "vitest";
import { desactivarCajeroSchema } from "./desactivar-cajero.schema.js";

describe("desactivarCajeroSchema (gestion-cajeros spec)", () => {
  it("acepta un uid válido (afirmativo)", () => {
    const resultado = desactivarCajeroSchema.safeParse({ uid: "uid_luis" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza un uid vacío (negativo)", () => {
    const resultado = desactivarCajeroSchema.safeParse({ uid: "" });
    expect(resultado.success).toBe(false);
  });
});
