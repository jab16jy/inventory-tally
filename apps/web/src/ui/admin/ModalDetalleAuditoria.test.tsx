// apps/web/src/ui/admin/ModalDetalleAuditoria.test.tsx
import type { EventoAuditoria } from "@conteo/shared/models/evento-auditoria.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ModalDetalleAuditoria } from "./ModalDetalleAuditoria.js";

const eventoPrueba: EventoAuditoria = {
  eventoId: "evt_test_999",
  tipo: "APORTE_MODIFICADO",
  ocurridoEn: new Date("2026-08-15T14:30:00Z"),
  usuarioNombre: "Carlos Contador",
  cantidadAnterior: 20,
  cantidadNueva: 25,
  sucursalId: "suc_sur",
};

describe("ModalDetalleAuditoria", () => {
  it("no renderiza el diálogo si evento es null", () => {
    const onCerrar = vi.fn();
    render(<ModalDetalleAuditoria evento={null} onCerrar={onCerrar} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renderiza información detallada del evento cuando está presente", () => {
    const onCerrar = vi.fn();
    render(<ModalDetalleAuditoria evento={eventoPrueba} onCerrar={onCerrar} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getAllByText(/evt_test_999/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/aporte modificado/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/carlos contador/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/20 → 25 unid\./i)).toBeInTheDocument();
  });

  it("llama a onCerrar al hacer clic en el botón Cerrar", () => {
    const onCerrar = vi.fn();
    render(<ModalDetalleAuditoria evento={eventoPrueba} onCerrar={onCerrar} />);

    fireEvent.click(screen.getByRole("button", { name: /cerrar/i }));
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });

  it("el diálogo va centrado (m-auto: el preflight anula el margin:auto del UA)", () => {
    render(<ModalDetalleAuditoria evento={eventoPrueba} onCerrar={vi.fn()} />);

    expect(screen.getByRole("dialog")).toHaveClass("m-auto");
  });
});
