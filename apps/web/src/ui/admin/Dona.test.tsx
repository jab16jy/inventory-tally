// apps/web/src/ui/admin/Dona.test.tsx (docs/plan-panel-administrador.md §5, fase F5)
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PorcionAnalisis } from "@conteo/shared/services/calculadora-analisis.js";
import { moneda, porcentaje } from "../../lib/formato.js";
import { Dona } from "./Dona.js";

/** Mismo motivo que en ComparativoScreen.test.tsx: el invariante de
 *  `distribuirRedondeo` vive en las décimas enteras, no en la suma en coma
 *  flotante de los porcentajes impresos. */
function sumaEnDecimas(textos: readonly string[]): number {
  return textos.reduce((total, t) => total + Math.round(parseFloat(t.replace(",", ".")) * 10), 0);
}

const ESPACIO_NO_SEPARABLE = String.fromCharCode(0xa0);

/** `moneda()` inserta un espacio de no separación que Testing Library
 *  colapsa a uno normal antes de comparar (verificado en formato.test.ts). */
function textoDom(s: string): string {
  return s.split(ESPACIO_NO_SEPARABLE).join(" ");
}

function porciones(...montos: number[]): PorcionAnalisis[] {
  return montos.map((monto, i) => ({ etiqueta: `Categoría ${i + 1}`, monto }));
}

describe("Dona (F5)", () => {
  it("los porcentajes del equivalente textual suman 1000 en décimas enteras", () => {
    // Tres porciones iguales: mismo caso 33.4/33.3/33.3 de mayor resto que
    // advierte el doc-comment de distribuirRedondeo.
    render(<Dona porciones={porciones(1_000, 1_000, 1_000)} etiqueta="Prueba" />);

    const textos = screen.getAllByTestId("porcion-porcentaje").map((n) => n.textContent ?? "");
    expect(textos).toHaveLength(3);
    expect(sumaEnDecimas(textos)).toBe(1000);
  });

  it("dibuja un <circle> por porción más la pista de fondo", () => {
    const { container } = render(<Dona porciones={porciones(500, 300, 200)} etiqueta="Prueba" />);

    // 3 porciones + 1 pista = 4 circles; la pista es el primero en el DOM.
    expect(container.querySelectorAll("circle")).toHaveLength(4);
  });

  it("el equivalente textual nombra cada porción con su etiqueta, porcentaje y dinero", () => {
    render(
      <Dona
        porciones={[
          { etiqueta: "Lácteos", monto: 300_000 },
          { etiqueta: "Aseo", monto: 100_000 },
        ]}
        etiqueta="Prueba"
      />,
    );

    expect(screen.getByText("Lácteos")).toBeInTheDocument();
    expect(screen.getByText("Aseo")).toBeInTheDocument();
    expect(screen.getByText(porcentaje(75))).toBeInTheDocument();
    expect(screen.getByText(porcentaje(25))).toBeInTheDocument();
    expect(screen.getByText(textoDom(moneda(300_000)))).toBeInTheDocument();
    expect(screen.getByText(textoDom(moneda(100_000)))).toBeInTheDocument();
  });

  it("el <svg> es aria-hidden: el equivalente accesible vive en la lista", () => {
    const { container } = render(<Dona porciones={porciones(1_000)} etiqueta="Prueba" />);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("sin porciones no dibuja svg y muestra un mensaje vacío, sin NaN", () => {
    const { container } = render(<Dona porciones={[]} etiqueta="Prueba" />);

    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).not.toMatch(/NaN/);
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument();
  });

  it("una única porción llega a 100,0 %", () => {
    render(<Dona porciones={porciones(1_000)} etiqueta="Prueba" />);

    expect(screen.getByText(porcentaje(100))).toBeInTheDocument();
  });

  it("la figura expone su etiqueta como nombre accesible", () => {
    render(<Dona porciones={porciones(1_000)} etiqueta="Participación en dinero" />);

    expect(screen.getByRole("figure", { name: "Participación en dinero" })).toBeInTheDocument();
  });

  it("cada arco mide lo que dice su porcentaje y los desplazamientos se acumulan", () => {
    // Sin esta aserción la geometría —que es TODO lo que hace la dona— queda
    // sin probar: una implementación que le diera a las tres porciones el
    // mismo arco y el mismo desplazamiento pasaría igual el resto del
    // archivo. 500/300/200 son exactamente 50 %, 30 % y 20 %.
    const { container } = render(<Dona porciones={porciones(500, 300, 200)} etiqueta="Prueba" />);

    const circunferencia = 2 * Math.PI * 60; // RADIO = 60 en Dona.tsx
    const hueco = 2; // HUECO_PX
    const brutos = [50, 30, 20].map((p) => (circunferencia * p) / 100);

    const porcionesSvg = Array.from(container.querySelectorAll("circle")).slice(1);
    const arcos = porcionesSvg.map((c) =>
      Number(c.getAttribute("stroke-dasharray")!.split(" ")[0]),
    );
    const desplazamientos = porcionesSvg.map((c) => Number(c.getAttribute("stroke-dashoffset")));

    // El arco pintado es el bruto menos el hueco de separación.
    arcos.forEach((arco, i) => expect(arco).toBeCloseTo(brutos[i]! - hueco, 6));

    // El desplazamiento acumula los arcos BRUTOS previos (no los recortados),
    // que es lo que hace que el anillo cierre exactamente en 100,0.
    expect(desplazamientos[0]).toBeCloseTo(0, 6);
    expect(desplazamientos[1]).toBeCloseTo(-brutos[0]!, 6);
    expect(desplazamientos[2]).toBeCloseTo(-(brutos[0]! + brutos[1]!), 6);
  });

  it("las porciones llevan stroke-opacity distinto y descendente (rampa ordinal de un solo matiz)", () => {
    const { container } = render(<Dona porciones={porciones(500, 300, 200)} etiqueta="Prueba" />);

    // El primer circle es la pista de fondo; los siguientes son las porciones
    // en el orden ya ordenado desc por el llamador.
    const circles = Array.from(container.querySelectorAll("circle")).slice(1);
    const opacidades = circles.map((c) => Number(c.getAttribute("stroke-opacity")));

    expect(opacidades).toHaveLength(3);
    expect(new Set(opacidades).size).toBe(3);
    expect(opacidades[0]).toBeGreaterThan(opacidades[1]!);
    expect(opacidades[1]).toBeGreaterThan(opacidades[2]!);
  });
});
