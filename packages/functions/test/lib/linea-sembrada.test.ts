import { describe, expect, it } from "vitest";
import { SIN_AREA } from "@conteo/shared/models/linea-conteo.js";
import { lineaSembrada } from "../../src/lib/linea-sembrada.js";

describe("lineaSembrada (I-7)", () => {
  it("congela valorUnitario y etiqueta tal cual se pasan", () => {
    const linea = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: "Aseo",
      areaFijaPorAdmin: false,
      actualizadaPor: "uid_admin",
    });
    expect(linea.valorUnitario).toBe(5000);
    expect(linea.etiqueta).toBe("$5.000");
  });

  it("area undefined → sale SIN_AREA", () => {
    const linea = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: undefined,
      areaFijaPorAdmin: false,
      actualizadaPor: "uid_admin",
    });
    expect(linea.area).toBe(SIN_AREA);
  });

  it("area 'Aseo' → sale 'Aseo' (par afirmativo de SIN_AREA)", () => {
    const linea = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: "Aseo",
      areaFijaPorAdmin: false,
      actualizadaPor: "uid_admin",
    });
    expect(linea.area).toBe("Aseo");
  });

  it("cantidadTotal arranca en 0", () => {
    const linea = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: undefined,
      areaFijaPorAdmin: false,
      actualizadaPor: "uid_admin",
    });
    expect(linea.cantidadTotal).toBe(0);
  });

  it("areaFijaPorAdmin (ADR-22) se escribe tal cual se pasa", () => {
    const fija = lineaSembrada({
      categoriaId: "cat_1",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: "Aseo",
      areaFijaPorAdmin: true,
      actualizadaPor: "uid_admin",
    });
    expect(fija.areaFijaPorAdmin).toBe(true);

    const libre = lineaSembrada({
      categoriaId: "cat_2",
      valorUnitario: 5000,
      etiqueta: "$5.000",
      area: undefined,
      areaFijaPorAdmin: false,
      actualizadaPor: "uid_admin",
    });
    expect(libre.areaFijaPorAdmin).toBe(false);
  });
});
