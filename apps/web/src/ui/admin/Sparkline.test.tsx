// apps/web/src/ui/admin/Sparkline.test.tsx — red primero (AGENTS.md §2).
// Cubre la matemática de coordenadas extraída de EvolucionMensual.test.tsx:
// serie vacía, un valor, varios valores, rango 0 (todos iguales), tamaño
// custom y la convención `aria-hidden`.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Sparkline } from "./Sparkline.js";

describe("Sparkline", () => {
  it("serie vacía no dibuja svg", () => {
    const { container } = render(<Sparkline valores={[]} />);

    expect(container.querySelector("svg")).toBeNull();
  });

  it("un solo valor: pinta el punto pero ninguna polyline (no se ve con un solo punto)", () => {
    const { container } = render(<Sparkline valores={[100]} />);

    expect(container.querySelector("polyline")).toBeNull();
    expect(container.querySelectorAll("circle")).toHaveLength(1);
  });

  it("dos valores dibuja una polyline con dos puntos", () => {
    const { container } = render(<Sparkline valores={[100, 300]} />);

    const puntos = container.querySelector("polyline")!.getAttribute("points")!.trim().split(" ");

    expect(puntos).toHaveLength(2);
    expect(container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("valores todos iguales (rango 0): línea plana centrada verticalmente, sin NaN", () => {
    const { container } = render(<Sparkline valores={[50, 50, 50]} alto={20} />);

    const puntos = container
      .querySelector("polyline")!
      .getAttribute("points")!
      .trim()
      .split(" ")
      .map((p) => p.split(",").map(Number));

    for (const [, y] of puntos) {
      expect(y).toBe(10); // alto / 2, sin dividir por el rango 0
    }
  });

  it("el <svg> es aria-hidden", () => {
    const { container } = render(<Sparkline valores={[1, 2, 3]} />);

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  // Sin esta aserción, `radioPunto` no lo ejercita nadie: romper su cableado
  // (o cambiarle el valor por defecto) encogería en silencio los puntos de
  // EvolucionMensual, que pasa 3 justamente para conservar los círculos que
  // tenía antes de que la curva se extrajera a este componente.
  it("radioPunto fija el radio de los puntos, y por defecto es 2", () => {
    const { container: porDefecto } = render(<Sparkline valores={[1, 2, 3]} />);
    for (const punto of porDefecto.querySelectorAll("circle")) {
      expect(punto).toHaveAttribute("r", "2");
    }

    const { container: custom } = render(<Sparkline valores={[1, 2, 3]} radioPunto={3} />);
    for (const punto of custom.querySelectorAll("circle")) {
      expect(punto).toHaveAttribute("r", "3");
    }
  });

  it("respeta ancho/alto custom en el viewBox", () => {
    const { container } = render(<Sparkline valores={[1, 2]} ancho={64} alto={24} />);

    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("viewBox", "0 0 64 24");
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("height", "24");
  });
});
