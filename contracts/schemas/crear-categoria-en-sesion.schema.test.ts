import { describe, expect, it } from "vitest";
import { crearCategoriaEnSesionSchema } from "./crear-categoria-en-sesion.schema.js";

const valido = {
  sesionId: "ses_20260901_norte_01",
  etiqueta: "Bolsas de basura",
};

describe("crearCategoriaEnSesionSchema (doc 08 §3)", () => {
  it("acepta un objeto válido sin área (afirmativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("acepta un objeto válido con areaId (afirmativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, areaId: "area_aseo" });
    expect(resultado.success).toBe(true);
  });

  it("rechaza sesionId vacío (negativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, sesionId: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza etiqueta vacía (negativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, etiqueta: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza etiqueta de más de 60 caracteres (negativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse({
      ...valido,
      etiqueta: "a".repeat(61),
    });
    expect(resultado.success).toBe(false);
  });

  it("acepta etiqueta de exactamente 60 caracteres (par afirmativo del límite)", () => {
    // Sin este par, el test anterior pasaría igual con `.max(59)` o `.max(1)`:
    // sólo los dos juntos fijan dónde está el borde (AGENTS.md §2).
    const resultado = crearCategoriaEnSesionSchema.safeParse({
      ...valido,
      etiqueta: "a".repeat(60),
    });
    expect(resultado.success).toBe(true);
  });

  it("acepta `valor` si el cajero lo envía (ADR-23): ya no está reservado al admin", () => {
    // ADR-23 corrige la lectura de ADR-07 que llevó a I-9/ADR-21 a bloquear
    // este campo: lo que ADR-07 protege es el consolidado de sesión, no el
    // valorUnitario de una línea. Par afirmativo con el siguiente test.
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, valor: 5000 });

    expect(resultado.success).toBe(true);
    expect(resultado.data).toHaveProperty("valor", 5000);
  });

  it("acepta un objeto válido sin `valor` (afirmativo, par del anterior)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse(valido);

    expect(resultado.success).toBe(true);
    expect(resultado.data).not.toHaveProperty("valor");
  });

  it("rechaza `valor` negativo (negativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, valor: -1 });

    expect(resultado.success).toBe(false);
  });

  it("rechaza `valor` decimal (negativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, valor: 5000.5 });

    expect(resultado.success).toBe(false);
  });

  it("descarta `orden` por la misma razón que `valor` (par afirmativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, orden: 7 });

    expect(resultado.success).toBe(true);
    expect(resultado.data).not.toHaveProperty("orden");
  });
});
