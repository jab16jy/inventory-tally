// El deck fijo inferior: totales de unidades — nunca dinero (I-9) — y el
// botón que lleva a terminar.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Deck } from "./Deck.js";

describe("Deck", () => {
  it("muestra el aporte propio y el del equipo, en unidades", () => {
    render(<Deck tuAporte={412} equipo={1840} onFinalizar={() => {}} />);
    expect(screen.getByText(/412 u/i)).toBeInTheDocument();
    expect(screen.getByText(/1[.,]?840 u/i)).toBeInTheDocument();
  });

  it("nunca usa el patrón 'Tú: N' ni 'Equipo: N' de la fila (colisionaría con sus tests)", () => {
    render(<Deck tuAporte={1} equipo={1} onFinalizar={() => {}} />);
    expect(screen.queryByText(/tú: 1/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/equipo: 1/i)).not.toBeInTheDocument();
  });

  it("el botón Finalizar conteo llama a onFinalizar", () => {
    const onFinalizar = vi.fn();
    render(<Deck tuAporte={0} equipo={0} onFinalizar={onFinalizar} />);
    fireEvent.click(screen.getByRole("button", { name: /finalizar conteo/i }));
    expect(onFinalizar).toHaveBeenCalledOnce();
  });
});
