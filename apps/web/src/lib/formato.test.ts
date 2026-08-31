// apps/web/src/lib/formato.test.ts (docs/plan-panel-administrador.md §5, F1)
import { describe, expect, it } from "vitest";
import { datos, duracion, fecha, moneda, numero } from "./formato.js";

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

  describe("duracion (ADR-20, comparativo por ejecución)", () => {
    it("0 ms es '0 min'", () => {
      expect(duracion(0)).toBe("0 min");
    });

    it("menos de un minuto trunca a '0 min', igual criterio que diasEntre", () => {
      expect(duracion(30_000)).toBe("0 min");
    });

    it("minutos bajo una hora, sin unidad de hora", () => {
      expect(duracion(45 * 60_000)).toBe("45 min");
    });

    it("justo antes del salto a horas: 59 min", () => {
      expect(duracion(59 * 60_000)).toBe("59 min");
    });

    it("salto a horas a los 60 min exactos: '1 h', sin '0 min' colgando", () => {
      expect(duracion(60 * 60_000)).toBe("1 h");
    });

    it("horas y minutos combinados", () => {
      expect(duracion(3 * 3_600_000 + 20 * 60_000)).toBe("3 h 20 min");
    });

    it("justo antes del salto a días: 23 h 59 min", () => {
      expect(duracion(23 * 3_600_000 + 59 * 60_000)).toBe("23 h 59 min");
    });

    it("salto a días a las 24 h exactas: '1 d', sin '0 h' colgando", () => {
      expect(duracion(24 * 3_600_000)).toBe("1 d");
    });

    it("días y horas combinados, sin minutos (fuera de escala en ese tramo)", () => {
      expect(duracion(2 * 86_400_000 + 4 * 3_600_000)).toBe("2 d 4 h");
    });
  });
});
