// apps/web/src/ui/BotonSalir.test.tsx — issue #40 (variante A elegida: Salir
// dentro de la cabecera existente, sin barra nueva).
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BotonSalir } from "./BotonSalir.js";

describe("BotonSalir (issue #40)", () => {
  it("expone un control de salida cuyo nombre accesible es exactamente 'Salir'", () => {
    render(<BotonSalir onSalir={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^salir$/i })).toBeInTheDocument();
  });

  it("al tocarlo, llama a onSalir", () => {
    const onSalir = vi.fn();
    render(<BotonSalir onSalir={onSalir} />);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));

    expect(onSalir).toHaveBeenCalledTimes(1);
  });
});
