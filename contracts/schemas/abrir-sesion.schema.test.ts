import { describe, expect, it } from "vitest";
import { abrirSesionSchema } from "./abrir-sesion.schema.js";

describe("abrirSesionSchema (doc 08 §3)", () => {
  it("acepta una entrada válida", () => {
    const resultado = abrirSesionSchema.safeParse({ sucursalId: "suc_norte" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza sucursalId vacío", () => {
    const resultado = abrirSesionSchema.safeParse({ sucursalId: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza sucursalId ausente", () => {
    const resultado = abrirSesionSchema.safeParse({});
    expect(resultado.success).toBe(false);
  });

  it("rechaza sucursalId que no es string", () => {
    const resultado = abrirSesionSchema.safeParse({ sucursalId: 123 });
    expect(resultado.success).toBe(false);
  });
});
