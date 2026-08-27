import { describe, expect, it } from "vitest";
import { crearCategoriaSchema } from "./crear-categoria.schema.js";

const valido = {
  etiqueta: "Litro",
  valor: 1000,
  orden: 1,
};

describe("crearCategoriaSchema (docs/plan-panel-administrador.md §3)", () => {
  it("acepta un objeto válido (afirmativo)", () => {
    const resultado = crearCategoriaSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("rechaza etiqueta vacía (negativo)", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, etiqueta: "" });
    expect(resultado.success).toBe(false);
  });

  it("rechaza valor no entero (negativo)", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, valor: 1.5 });
    expect(resultado.success).toBe(false);
  });

  it("rechaza valor negativo (negativo)", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, valor: -1 });
    expect(resultado.success).toBe(false);
  });

  it("rechaza orden negativo (negativo)", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, orden: -1 });
    expect(resultado.success).toBe(false);
  });

  it("acepta sin sucursalesAsignadas (categoría global, comportamiento actual)", () => {
    const resultado = crearCategoriaSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("acepta sucursalesAsignadas con al menos una sucursal (D6: catálogo por sucursal)", () => {
    const resultado = crearCategoriaSchema.safeParse({
      ...valido,
      sucursalesAsignadas: ["suc_norte"],
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza sucursalesAsignadas vacío (footgun: nadie la vería)", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, sucursalesAsignadas: [] });
    expect(resultado.success).toBe(false);
  });

  it("rechaza más de 10 sucursales asignadas (mismo límite que crearCajeroSchema)", () => {
    const sucursalesAsignadas = Array.from({ length: 11 }, (_, i) => `suc_${i}`);
    const resultado = crearCategoriaSchema.safeParse({ ...valido, sucursalesAsignadas });
    expect(resultado.success).toBe(false);
  });

  it("acepta sin areaId (categoría sin área, comportamiento válido)", () => {
    const resultado = crearCategoriaSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("acepta areaId cuando se especifica", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, areaId: "area_aseo" });
    expect(resultado.success).toBe(true);
  });
});
