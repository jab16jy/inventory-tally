// apps/web/src/ui/admin/EvolucionMensual.test.tsx (docs/diseno/10-analisis-y-dashboards.md
// §5-6) — mismo molde de prueba que Dona.test.tsx.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Historico } from "@conteo/shared/models/historico.js";
import { fecha, moneda } from "../../lib/formato.js";
import { EvolucionMensual } from "./EvolucionMensual.js";

const ESPACIO_NO_SEPARABLE = String.fromCharCode(0xa0);
function textoDom(s: string): string {
  return s.split(ESPACIO_NO_SEPARABLE).join(" ");
}

function historico(sesionId: string, cerradaEn: string, totalMonetario: number): Historico {
  return {
    sesionId,
    cerradaEn: new Date(cerradaEn),
    totalUnidades: 1,
    totalMonetario,
    porCategoria: {},
  };
}

describe("EvolucionMensual (1.7)", () => {
  it("sin históricos no dibuja svg y muestra un mensaje vacío", () => {
    const { container } = render(<EvolucionMensual historicos={[]} etiqueta="Prueba" />);

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText(/sin históricos/i)).toBeInTheDocument();
  });

  it("un solo histórico: pinta el punto pero ninguna polyline (no se ve con un solo punto)", () => {
    const { container } = render(
      <EvolucionMensual
        historicos={[historico("ses_1", "2026-08-01T00:00:00Z", 100_000)]}
        etiqueta="Prueba"
      />,
    );

    expect(container.querySelector("polyline")).toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("con varios históricos (orden cerradaEn desc de la consulta) dibuja una polyline invirtiendo a orden cronológico", () => {
    // Llega en orden desc (como devuelve historicosRecientesPorSucursal).
    const serie = [
      historico("ses_sep", "2026-09-01T00:00:00Z", 300_000),
      historico("ses_ago", "2026-08-01T00:00:00Z", 100_000),
    ];
    const { container } = render(<EvolucionMensual historicos={serie} etiqueta="Prueba" />);

    const puntos = container
      .querySelector("polyline")!
      .getAttribute("points")!
      .trim()
      .split(" ")
      .map((p) => p.split(",").map(Number));

    // Cronológico: ago (más barato) primero → x menor; sep (más caro) → x mayor.
    expect(puntos[0]![0]).toBeLessThan(puntos[1]![0]!);
    // Más dinero = punto más alto (y menor, el SVG crece hacia abajo).
    expect(puntos[1]![1]).toBeLessThan(puntos[0]![1]!);
  });

  it("el equivalente accesible en <ul> muestra fecha y dinero de cada histórico", () => {
    const serie = [historico("ses_1", "2026-08-01T00:00:00Z", 250_000)];
    render(<EvolucionMensual historicos={serie} etiqueta="Prueba" />);

    expect(screen.getByText(fecha(new Date("2026-08-01T00:00:00Z")))).toBeInTheDocument();
    expect(screen.getByText(textoDom(moneda(250_000)))).toBeInTheDocument();
  });

  it("el <svg> es aria-hidden y la figura expone su etiqueta como nombre accesible", () => {
    const { container } = render(
      <EvolucionMensual
        historicos={[historico("ses_1", "2026-08-01T00:00:00Z", 1)]}
        etiqueta="Evolución mensual"
      />,
    );

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("figure", { name: "Evolución mensual" })).toBeInTheDocument();
  });
});
