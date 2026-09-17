// apps/web/src/ui/admin/EvolucionMensual.test.tsx (docs/diseno/10-analisis-y-dashboards.md
// §5-6) — mismo molde de prueba que Sparkline.test.tsx.
//
// Cambio de diseño: el tooltip por punto se eliminó (docs/diseno/11 §314 exige
// objetivos táctiles ≥48px; con LIMITE_SERIE_POR_DEFECTO=12 puntos en 280px
// cada columna mide ~23px, aritméticamente imposible en un teléfono de 320px).
// La lista de valores está SIEMPRE en el DOM y en el árbol de accesibilidad;
// un botón «Ver valores» sólo alterna si se ve (sr-only) o no.
import { fireEvent, render, screen } from "@testing-library/react";
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
    porArea: {},
  };
}

describe("EvolucionMensual (1.7)", () => {
  it("sin históricos no dibuja svg, no hay botón y muestra el mensaje honesto", () => {
    const { container } = render(<EvolucionMensual historicos={[]} etiqueta="Prueba" />);

    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Sin cierres anteriores para comparar.")).toBeInTheDocument();
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

  it("los valores de cada cierre están en el DOM como texto SIEMPRE, colapsada o desplegada", () => {
    const serie = [historico("ses_1", "2026-08-01T00:00:00Z", 250_000)];
    render(<EvolucionMensual historicos={serie} etiqueta="Prueba" />);

    // Colapsada (estado inicial): el texto ya está en el DOM, sólo sr-only.
    expect(screen.getByText(fecha(new Date("2026-08-01T00:00:00Z")))).toBeInTheDocument();
    expect(screen.getByText(textoDom(moneda(250_000)))).toBeInTheDocument();

    // Desplegada: sigue estando, ahora visible.
    fireEvent.click(screen.getByRole("button", { name: /ver valores/i }));
    expect(screen.getByText(fecha(new Date("2026-08-01T00:00:00Z")))).toBeInTheDocument();
    expect(screen.getByText(textoDom(moneda(250_000)))).toBeInTheDocument();
  });

  it('el botón "Ver valores" alterna aria-expanded y la clase sr-only de la lista', () => {
    const serie = [historico("ses_1", "2026-08-01T00:00:00Z", 250_000)];
    const { container } = render(<EvolucionMensual historicos={serie} etiqueta="Prueba" />);

    const boton = screen.getByRole("button", { name: /ver valores/i });
    expect(boton).toHaveAttribute("aria-expanded", "false");
    expect(container.querySelector("ul")).toHaveClass("sr-only");

    fireEvent.click(boton);
    expect(screen.getByRole("button", { name: /ocultar valores/i })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(container.querySelector("ul")).not.toHaveClass("sr-only");

    fireEvent.click(screen.getByRole("button", { name: /ocultar valores/i }));
    expect(screen.getByRole("button", { name: /ver valores/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(container.querySelector("ul")).toHaveClass("sr-only");
  });

  it("al imprimir: el sparkline y el botón se ocultan, y la lista de valores se fuerza visible", () => {
    const serie = [historico("ses_1", "2026-08-01T00:00:00Z", 250_000)];
    const { container } = render(<EvolucionMensual historicos={serie} etiqueta="Prueba" />);

    expect(container.querySelector("svg")).toHaveClass("print:hidden");
    expect(screen.getByRole("button", { name: /ver valores/i })).toHaveClass("print:hidden");
    // La lista sigue colapsada (`sr-only`) en pantalla, pero `print:not-sr-only`
    // la fuerza visible en la hoja impresa sin tocar el árbol de
    // accesibilidad — misma convención que prohíbe `hidden`/`display:none`.
    const lista = container.querySelector("ul")!;
    expect(lista).toHaveClass("sr-only");
    expect(lista).toHaveClass("print:not-sr-only");
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
