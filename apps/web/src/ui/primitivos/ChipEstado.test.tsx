// El eje de relleno único del sistema (plan §1): sólido = a salvo, hueco =
// en tránsito, rojo = riesgo real. Nunca verde.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChipEstado } from "./ChipEstado.js";

describe("ChipEstado", () => {
  it("sincronizado se lee como tal", () => {
    render(<ChipEstado estado="sincronizado" />);
    expect(screen.getByText(/sincronizado/i)).toBeInTheDocument();
  });

  it("pendiente comunica que sigue en tránsito, no confirmado", () => {
    render(<ChipEstado estado="pendiente" />);
    expect(screen.getByText(/sincronizando|pendiente/i)).toBeInTheDocument();
  });

  it("sin conexión es el único estado que usa el rojo de riesgo", () => {
    render(<ChipEstado estado="sin-conexion" />);
    expect(screen.getByText(/sin conexión/i)).toBeInTheDocument();
  });
});
