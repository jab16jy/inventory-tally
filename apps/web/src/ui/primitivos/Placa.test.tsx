// apps/web/src/ui/primitivos/Placa.test.tsx — LA FIRMA sólo se pinta donde
// el concepto "confirmado por el servidor" existe.
//
// Se consulta por `container` y no por un `data-testid`: la regla es un hijo
// `aria-hidden` (invisible para las consultas por rol o por texto, y así debe
// seguir), y añadirle a un primitivo de producción una prop que sólo usa el
// test es API que nadie más consume.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Placa } from "./Placa.js";

function regla(contenedor: HTMLElement): Element | null {
  return contenedor.querySelector("[aria-hidden='true']");
}

describe("Placa · la regla de tinta (DESIGN.md §The Left Ink Rule)", () => {
  it("pinta la regla sólida cuando el servidor confirmó", () => {
    const { container } = render(<Placa confirmado>x</Placa>);
    expect(regla(container)).toHaveClass("bg-senal");
  });

  it("pinta la regla hueca cuando el aporte está en tránsito", () => {
    const { container } = render(<Placa confirmado={false}>x</Placa>);
    expect(regla(container)).toHaveClass("bg-senal-hueco");
  });

  it("NO pinta regla cuando la pantalla no tiene el concepto de confirmación", () => {
    // `/sucursales` no sincroniza nada: una regla ámbar ahí sería una señal
    // sin significado, justo la decoración que el sistema rechaza. Ausencia
    // de la prop = el concepto no aplica, distinto de `false` = pendiente.
    const { container } = render(<Placa>x</Placa>);
    expect(regla(container)).toBeNull();
  });
});
