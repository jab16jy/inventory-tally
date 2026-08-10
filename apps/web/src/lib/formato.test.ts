// apps/web/src/lib/formato.test.ts (docs/plan-panel-administrador.md §5, F1)
import { describe, expect, it } from "vitest";
import { datos, fecha, moneda, numero } from "./formato.js";

describe("formato (doc plan-panel-administrador §5, fase F1)", () => {
  it("formatea 1234500 como moneda es-CO sin decimales", () => {
    // Intl inserta U+00A0 (espacio de no separación) entre "$" y la cifra,
    // no un espacio normal — verificado en el runtime real, no supuesto.
    expect(moneda(1234500)).toBe("$ 1.234.500");
  });

  it("agrupa miles en el formato de número", () => {
    expect(numero(1234500)).toBe("1.234.500");
  });

  it("formatea una fecha UTC en hora de Bogotá (F2)", () => {
    // 2026-08-01T15:30:00Z == 2026-08-01T10:30:00-05:00 en Bogotá (sin
    // horario de verano) — cadena exacta verificada en el runtime real,
    // no supuesta.
    expect(fecha(new Date("2026-08-01T15:30:00Z"))).toBe("1/08/2026, 10:30 a. m.");
  });

  it("formatea bytes como KB bajo 1024 KB (issue #20 item 2)", () => {
    expect(datos(2048)).toBe("2 KB");
  });

  it("pasa a MB a partir de 1024 KB", () => {
    expect(datos(1024 * 1024 * 2.5)).toBe("2,5 MB");
  });
});
