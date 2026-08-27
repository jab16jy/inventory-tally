// apps/web/src/ui/CabeceraCajero.test.tsx — issue #40. Cabecera compartida
// por SucursalesScreen/PrepararScreen/FinalizarScreen: mismo título callado
// que ya tenían + Salir (variante A).
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CabeceraCajero } from "./CabeceraCajero.js";

describe("CabeceraCajero (issue #40)", () => {
  it("muestra el título de la pantalla", () => {
    render(<CabeceraCajero titulo="Sucursales" onSalir={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Sucursales" })).toBeInTheDocument();
  });

  it("ofrece un control de salida visible que no se llama 'Cerrar sesión'", () => {
    render(<CabeceraCajero titulo="Sucursales" onSalir={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^salir$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();
  });

  it("al tocar Salir, llama a onSalir", () => {
    const onSalir = vi.fn();
    render(<CabeceraCajero titulo="Sucursales" onSalir={onSalir} />);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));

    expect(onSalir).toHaveBeenCalledTimes(1);
  });
});
