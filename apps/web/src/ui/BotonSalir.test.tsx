// apps/web/src/ui/BotonSalir.test.tsx — issue #40 (variante A elegida: Salir
// dentro de la cabecera existente, sin barra nueva) + issue #72 (confirmación
// antes de invocar onSalir, ver docs/diseno/13-decisiones-adr.md#adr-19).
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BotonSalir } from "./BotonSalir.js";

describe("BotonSalir (issue #40)", () => {
  it("expone un control de salida cuyo nombre accesible es exactamente 'Salir'", () => {
    render(<BotonSalir onSalir={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^salir$/i })).toBeInTheDocument();
  });

  it("al tocarlo, todavía NO llama a onSalir — issue #72 exige confirmar antes", () => {
    const onSalir = vi.fn();
    render(<BotonSalir onSalir={onSalir} />);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));

    expect(onSalir).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("confirmar dentro del diálogo llama a onSalir", () => {
    const onSalir = vi.fn();
    render(<BotonSalir onSalir={onSalir} />);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^salir$/i }));

    expect(onSalir).toHaveBeenCalledTimes(1);
  });

  it("cancelar en el diálogo cierra sin llamar a onSalir", () => {
    const onSalir = vi.fn();
    render(<BotonSalir onSalir={onSalir} />);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onSalir).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el diálogo va centrado (m-auto: el preflight anula el margin:auto del UA)", () => {
    render(<BotonSalir onSalir={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));

    expect(screen.getByRole("dialog")).toHaveClass("m-auto");
  });
});
