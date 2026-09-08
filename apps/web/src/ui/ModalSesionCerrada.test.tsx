// apps/web/src/ui/ModalSesionCerrada.test.tsx — F4-A1, doc 11 §5 "Sesión
// cerrada por el admin" (⚫ modal bloqueante + salida).
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalSesionCerrada } from "./ModalSesionCerrada.js";

describe("ModalSesionCerrada", () => {
  it("no está visible cuando abierta=false", () => {
    render(<ModalSesionCerrada abierta={false} onSalir={() => {}} />);
    // <dialog> sin abrir no se considera visible (mismo criterio que
    // Hoja.test.tsx): sin el atributo `open` tampoco expone role="dialog".
    expect(screen.queryByText(/cerró esta sesión/i)).not.toBeVisible();
  });

  it("abierta=true muestra el aviso y el botón Salir, nunca uno de cerrar/descartar", () => {
    render(<ModalSesionCerrada abierta={true} onSalir={() => {}} />);

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText(/cerró esta sesión/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /salir/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
  });

  it("tocar Salir llama a onSalir", () => {
    const onSalir = vi.fn();
    render(<ModalSesionCerrada abierta={true} onSalir={onSalir} />);

    fireEvent.click(screen.getByRole("button", { name: /salir/i }));
    expect(onSalir).toHaveBeenCalledOnce();
  });

  it("no añade un role=alert (ya reservado a los banners de riesgo real)", () => {
    render(<ModalSesionCerrada abierta={true} onSalir={() => {}} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("el modal va centrado (m-auto: el preflight anula el margin:auto del UA)", () => {
    render(<ModalSesionCerrada abierta={true} onSalir={() => {}} />);
    expect(screen.getByRole("dialog")).toHaveClass("m-auto");
  });
});
