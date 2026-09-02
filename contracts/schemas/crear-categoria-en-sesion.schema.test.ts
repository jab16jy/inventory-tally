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

  it("descarta `valor` si un cliente lo envía: el cajero nunca fija un importe (I-9, ADR-07)", () => {
    // La guarda es el DESCARTE, no el rechazo. Los esquemas de contracts/ son
    // `z.object` sin `.strict()`, y `validar()` (packages/functions/src/lib/
    // validar.ts) devuelve `resultado.data` — así que una clave `valor`
    // enviada por un cliente manipulado no llega a la callable. El servidor
    // escribe `valor: 0` y el admin precia después.
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, valor: 999999 });

    expect(resultado.success).toBe(true);
    expect(resultado.data).not.toHaveProperty("valor");
  });

  it("descarta `orden` por la misma razón que `valor` (par afirmativo)", () => {
    const resultado = crearCategoriaEnSesionSchema.safeParse({ ...valido, orden: 7 });

    expect(resultado.success).toBe(true);
    expect(resultado.data).not.toHaveProperty("orden");
  });
});
