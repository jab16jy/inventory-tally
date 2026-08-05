// apps/web/src/ui/BannerPendientes.test.tsx — F4-B, paso de contraste AA
// (docs/plan-diseno-visual-pwa.md §8): `text-riesgo` sobre
// `--color-riesgo-placa` mide 3.93:1 (oklch(0.62 0.21 25) sobre
// oklch(0.26 0.06 25), fórmula WCAG) — por debajo del mínimo AA de 4.5:1
// para texto normal, y el `<strong>` no es "texto grande" (15px semibold no
// llega a los 18.66px que exige la excepción). No había archivo de test
// dedicado para este banner: el resto de su comportamiento ya lo cubren
// ConteoScreen.test.tsx y ConteoScreen.f4.test.tsx (el `role="alert"`
// único, sin botón de cerrar); éste sólo fija el contraste de su énfasis.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BannerPendientes } from "./BannerPendientes.js";

describe("BannerPendientes · contraste AA del énfasis (F4-B)", () => {
  it('el "No cierres la aplicación." en negrita no usa text-riesgo (3.93:1, bajo AA) sobre el fondo del banner', () => {
    render(<BannerPendientes pendientes={3} />);

    const enfasis = screen.getByText("No cierres la aplicación.");
    expect(enfasis).not.toHaveClass("text-riesgo");
  });
});
