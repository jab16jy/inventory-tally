// apps/web/src/lib/formato.test.ts (docs/plan-panel-administrador.md §5, F1)
import { describe, expect, it } from "vitest";
import { moneda, numero } from "./formato.js";

describe("formato (doc plan-panel-administrador §5, fase F1)", () => {
  it("formatea 1234500 como moneda es-CO sin decimales", () => {
    // Intl inserta U+00A0 (espacio de no separación) entre "$" y la cifra,
    // no un espacio normal — verificado en el runtime real, no supuesto.
    expect(moneda(1234500)).toBe("$ 1.234.500");
  });

  it("agrupa miles en el formato de número", () => {
    expect(numero(1234500)).toBe("1.234.500");
  });
});
