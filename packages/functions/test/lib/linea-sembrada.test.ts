import { describe, expect, it } from "vitest";
import { lineaSembrada } from "../../src/lib/linea-sembrada.js";

describe("lineaSembrada (I-7, ADR-23)", () => {
  it("congela valorUnitario y etiqueta tal cual se pasan", () => {
    const linea = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      actualizadaPor: "uid_admin",
    });
    expect(linea.valorUnitario).toBe(5000);
    expect(linea.etiqueta).toBe("$5.000");
  });

  it("inicializa porArea en un objeto vacío {}", () => {
    const linea = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      actualizadaPor: "uid_admin",
    });
    expect(linea.porArea).toEqual({});
  });

  it("cantidadTotal arranca en 0", () => {
    const linea = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      actualizadaPor: "uid_admin",
    });
    expect(linea.cantidadTotal).toBe(0);
    expect(linea.numAportantes).toBe(0);
    expect(linea.versiones).toEqual({});
  });

  it("no expone area ni areaFijaPorAdmin (ADR-23)", () => {
    const linea = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      actualizadaPor: "uid_admin",
    });
    expect(linea).not.toHaveProperty("area");
    expect(linea).not.toHaveProperty("areaFijaPorAdmin");
  });
});
