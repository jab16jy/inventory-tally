import { describe, expect, it } from "vitest";
import { crearCategoriaSchema } from "./crear-categoria.schema.js";
import { actualizarCategoriaSchema } from "./actualizar-categoria.schema.js";

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

  it("acepta sin areaIds (categoría sin área, comportamiento válido)", () => {
    const resultado = crearCategoriaSchema.safeParse(valido);
    expect(resultado.success).toBe(true);
  });

  it("acepta un areaId cuando se especifica", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, areaIds: ["area_aseo"] });
    expect(resultado.success).toBe(true);
  });

  it("acepta varios areaIds (N:M: la categoría vive en varias áreas)", () => {
    const resultado = crearCategoriaSchema.safeParse({
      ...valido,
      areaIds: ["area_aseo", "area_bebidas"],
    });
    expect(resultado.success).toBe(true);
  });

  it("rechaza areaIds vacío (footgun: mismo criterio que sucursalesAsignadas)", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, areaIds: [] });
    expect(resultado.success).toBe(false);
  });

  it("rechaza claves desconocidas como el areaId legado (strict)", () => {
    const resultado = crearCategoriaSchema.safeParse({ ...valido, areaId: "area_legada" });
    expect(resultado.success).toBe(false);
  });
});

describe("actualizarCategoriaSchema", () => {
  const validoActualizar = {
    categoriaId: "cat_1",
    etiqueta: "Litro",
    valor: 1000,
    orden: 1,
  };

  it("acepta objeto válido", () => {
    expect(actualizarCategoriaSchema.safeParse(validoActualizar).success).toBe(true);
  });

  it("rechaza claves desconocidas como el areaId legado (strict)", () => {
    const resultado = actualizarCategoriaSchema.safeParse({
      ...validoActualizar,
      areaId: "area_legada",
    });
    expect(resultado.success).toBe(false);
  });
});
