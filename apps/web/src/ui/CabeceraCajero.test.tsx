// apps/web/src/ui/CabeceraCajero.test.tsx — issue #40. Cabecera compartida
// por SucursalesScreen/PrepararScreen/FinalizarScreen: mismo título callado
// que ya tenían + Salir (variante A).
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  it("al tocar Salir y confirmar, llama a onSalir (issue #72)", () => {
    const onSalir = vi.fn();
    render(<CabeceraCajero titulo="Sucursales" onSalir={onSalir} />);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^salir$/i }));

    expect(onSalir).toHaveBeenCalledTimes(1);
  });

  it("sin onVolverAdmin no muestra ningún control de vuelta al panel", () => {
    render(<CabeceraCajero titulo="Sucursales" onSalir={vi.fn()} />);

    expect(screen.queryByRole("button", { name: /volver al panel/i })).not.toBeInTheDocument();
  });

  it("con onVolverAdmin, muestra 'Volver al panel' y lo invoca sin diálogo de confirmación", () => {
    const onVolverAdmin = vi.fn();
    render(<CabeceraCajero titulo="Sucursales" onSalir={vi.fn()} onVolverAdmin={onVolverAdmin} />);

    fireEvent.click(screen.getByRole("button", { name: /volver al panel/i }));

    expect(onVolverAdmin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
