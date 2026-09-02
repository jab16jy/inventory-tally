// apps/web/src/ui/HojaAreas.test.tsx — ADR-21 (docs/diseno/13-decisiones-adr.md#adr-21) y
// doc 11 §4: el cajero vincula un área EXISTENTE a una categoría "Sin área",
// nunca crea una.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Area, LineaConteo } from "@conteo/shared";
import { HojaAreas } from "./HojaAreas.js";

function crearLinea(overrides: Partial<LineaConteo> = {}): LineaConteo {
  return {
    categoriaId: "cat_5000",
    valorUnitario: 5000,
    etiqueta: "$5.000",
    area: "Sin área",
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date("2026-08-02T08:00:00Z"),
    actualizadaPor: "",
    ...overrides,
  };
}

function crearArea(overrides: Partial<Area> = {}): Area {
  return {
    areaId: "area_aseo",
    nombre: "Aseo",
    activa: true,
    creadaEn: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  };
}

describe("HojaAreas (ADR-21, doc 11 §4)", () => {
  it("no está en el DOM visible cuando abierta=false", () => {
    render(
      <HojaAreas
        abierta={false}
        lineasSinArea={[crearLinea()]}
        areas={[crearArea()]}
        onVincular={() => {}}
        onVolver={() => {}}
      />,
    );
    expect(screen.queryByText("$5.000")).not.toBeVisible();
  });

  it("tocar una línea despliega los botones de área disponibles y vincular llama a onVincular con los args exactos", () => {
    const onVincular = vi.fn();
    render(
      <HojaAreas
        abierta={true}
        lineasSinArea={[crearLinea()]}
        areas={[crearArea(), crearArea({ areaId: "area_cocina", nombre: "Cocina" })]}
        onVincular={onVincular}
        onVolver={() => {}}
      />,
    );

    // Antes de tocar la línea, los botones de área no existen.
    expect(screen.queryByRole("button", { name: "Aseo" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "$5.000" }));
    fireEvent.click(screen.getByRole("button", { name: "Cocina" }));

    expect(onVincular).toHaveBeenCalledTimes(1);
    expect(onVincular).toHaveBeenCalledWith("cat_5000", "area_cocina");
  });

  it("con cero líneas sin área muestra un estado vacío, no una lista rota", () => {
    render(
      <HojaAreas
        abierta={true}
        lineasSinArea={[]}
        areas={[crearArea()]}
        onVincular={() => {}}
        onVolver={() => {}}
      />,
    );

    expect(screen.getByText(/no quedan productos sin área/i)).toBeInTheDocument();
  });

  it('el botón de salida se llama "Volver", nunca "Cerrar" (restricción dura de ConteoScreen.test.tsx)', () => {
    const onVolver = vi.fn();
    render(
      <HojaAreas
        abierta={true}
        lineasSinArea={[crearLinea()]}
        areas={[crearArea()]}
        onVincular={() => {}}
        onVolver={onVolver}
      />,
    );

    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^volver$/i }));
    expect(onVolver).toHaveBeenCalledTimes(1);
  });
});
