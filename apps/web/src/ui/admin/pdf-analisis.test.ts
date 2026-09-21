// apps/web/src/ui/admin/pdf-analisis.test.ts (odd/tasks/analisis-pdf-orden-precio.md, T2)
import { describe, expect, it } from "vitest";
import {
  filasPdfAnalisis,
  generarPdfAnalisis,
  nombreArchivoPdf,
  resumenPdf,
  type DatosPdfAnalisis,
} from "./pdf-analisis.js";

function datosBase(overrides: Partial<DatosPdfAnalisis> = {}): DatosPdfAnalisis {
  return {
    sucursalNombre: "Sucursal Norte",
    sesionAbiertaEn: new Date("2026-08-01T15:00:00Z"),
    generadoEn: new Date("2026-09-20T20:00:00Z"),
    dimension: "Categoría",
    orden: "Precio mayor → menor",
    filas: [
      { etiqueta: "$150000", unidades: 2, valor: 300_000, pct: 32.6 },
      { etiqueta: "$5000", unidades: 0, valor: 0, pct: 0 },
      { etiqueta: "$2000", unidades: 1_310, valor: 620_000, pct: 67.4 },
    ],
    totalUnidades: 1_312,
    totalMonetario: 920_000,
    deltaValor: null,
    valorPorUnidad: 701,
    contadas: 2,
    totalLineas: 3,
    ...overrides,
  };
}

describe("filasPdfAnalisis", () => {
  it("respeta el orden recibido y formatea unidades, dinero y % como la pantalla, con espacio normal", () => {
    const { cuerpo } = filasPdfAnalisis(datosBase());

    expect(cuerpo).toEqual([
      ["$150000", "2", "$ 300.000", "32,6%"],
      ["$5000", "0", "$ 0", "0,0%"],
      ["$2000", "1.310", "$ 620.000", "67,4%"],
    ]);
  });

  it("la fila total lleva el total de la sesión y 100 % literal", () => {
    const { total } = filasPdfAnalisis(datosBase());

    expect(total).toEqual(["Total", "1.312", "$ 920.000", "100,0%"]);
  });
});

describe("resumenPdf", () => {
  it("sin sesión anterior no agrega ninguna variación al valor contado", () => {
    const resumen = resumenPdf(datosBase());

    expect(resumen).toEqual([
      ["Valor contado", "$ 920.000"],
      ["Valor por unidad", "$ 701"],
      ["Unidades", "1.312 · 2 / 3 categorías contadas"],
      ["Desglose por", "Categoría"],
      ["Orden", "Precio mayor a menor"],
    ]);
  });

  it("con variación positiva la muestra con signo +", () => {
    const [valorContado] = resumenPdf(datosBase({ deltaValor: 12.5 }));

    expect(valorContado).toEqual(["Valor contado", "$ 920.000 (+12,5% vs. sesión anterior)"]);
  });

  it("con variación negativa usa un guion ASCII: el signo menos U+2212 no existe en WinAnsi", () => {
    const [valorContado] = resumenPdf(datosBase({ deltaValor: -4 }));

    expect(valorContado).toEqual(["Valor contado", "$ 920.000 (-4,0% vs. sesión anterior)"]);
  });

  it("variación cero se muestra sin signo", () => {
    const [valorContado] = resumenPdf(datosBase({ deltaValor: 0 }));

    expect(valorContado).toEqual(["Valor contado", "$ 920.000 (0,0% vs. sesión anterior)"]);
  });
});

describe("nombreArchivoPdf", () => {
  it("usa la sucursal sin tildes ni espacios y la fecha de la sesión en hora de Bogotá", () => {
    // 2026-08-02T03:00Z == 2026-08-01 22:00 en Bogotá: la fecha es la local.
    const nombre = nombreArchivoPdf(
      datosBase({
        sucursalNombre: "Sucursal Ñandú  Centro",
        sesionAbiertaEn: new Date("2026-08-02T03:00:00Z"),
      }),
    );

    expect(nombre).toBe("analisis-sucursal-nandu-centro-2026-08-01.pdf");
  });

  it("no deja guiones sueltos cuando el nombre empieza o termina en símbolos", () => {
    const nombre = nombreArchivoPdf(datosBase({ sucursalNombre: "(Norte)" }));

    expect(nombre).toBe("analisis-norte-2026-08-01.pdf");
  });
});

describe("generarPdfAnalisis", () => {
  it("genera un documento de al menos una página y con bytes", () => {
    const doc = generarPdfAnalisis(datosBase());

    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(doc.output("arraybuffer").byteLength).toBeGreaterThan(0);
  });

  it("una tabla larga pasa a varias páginas y cada una lleva 'Página N de M'", () => {
    const filas = Array.from({ length: 120 }, (_, i) => ({
      etiqueta: `$${i + 1}000`,
      unidades: 1,
      valor: (i + 1) * 1000,
      pct: 0.1,
    }));

    const doc = generarPdfAnalisis(datosBase({ filas }));
    const paginas = doc.getNumberOfPages();
    const salida = doc.output();

    expect(paginas).toBeGreaterThan(1);
    for (let n = 1; n <= paginas; n++) {
      expect(salida).toContain(`gina ${n} de ${paginas}`);
    }
  });
});
