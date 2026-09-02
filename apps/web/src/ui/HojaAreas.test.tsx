// apps/web/src/ui/HojaAreas.test.tsx — ADR-22 (supersede parcial de
// docs/diseno/13-decisiones-adr.md#adr-21): el cajero REETIQUETA un área
// EXISTENTE a una categoría cuyo catálogo sigue sin `areaId`, tantas veces
// como quiera, nunca crea una.
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
    areaFijaPorAdmin: false,
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

describe("HojaAreas (ADR-22)", () => {
  it("no está en el DOM visible cuando abierta=false", () => {
    render(
      <HojaAreas
        abierta={false}
        lineasReetiquetables={[crearLinea()]}
        areas={[crearArea()]}
        error={null}
        onReetiquetar={() => {}}
        onVolver={() => {}}
      />,
    );
    expect(screen.queryByText("$5.000")).not.toBeVisible();
  });

  it("tocar una línea despliega los botones de área disponibles y reetiquetar llama a onReetiquetar con los args exactos", () => {
    const onReetiquetar = vi.fn();
    render(
      <HojaAreas
        abierta={true}
        lineasReetiquetables={[crearLinea()]}
        areas={[crearArea(), crearArea({ areaId: "area_cocina", nombre: "Cocina" })]}
        error={null}
        onReetiquetar={onReetiquetar}
        onVolver={() => {}}
      />,
    );

    // Antes de tocar la línea, los botones de área no existen.
    expect(screen.queryByRole("button", { name: "Aseo" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /\$5\.000/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cocina" }));

    expect(onReetiquetar).toHaveBeenCalledTimes(1);
    expect(onReetiquetar).toHaveBeenCalledWith("cat_5000", "area_cocina");
  });

  it("ADR-22 · muestra el área vigente de cada línea como contexto", () => {
    render(
      <HojaAreas
        abierta={true}
        lineasReetiquetables={[crearLinea({ area: "Talleres" })]}
        areas={[crearArea()]}
        error={null}
        onReetiquetar={() => {}}
        onVolver={() => {}}
      />,
    );

    expect(screen.getByText("Talleres")).toBeInTheDocument();
  });

  it('ADR-22 · "Quitar área" llama a onReetiquetar sin areaId (vuelve a SIN_AREA)', () => {
    const onReetiquetar = vi.fn();
    render(
      <HojaAreas
        abierta={true}
        lineasReetiquetables={[crearLinea({ area: "Talleres" })]}
        areas={[crearArea()]}
        error={null}
        onReetiquetar={onReetiquetar}
        onVolver={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /\$5\.000/ }));
    fireEvent.click(screen.getByRole("button", { name: /quitar área/i }));

    expect(onReetiquetar).toHaveBeenCalledTimes(1);
    expect(onReetiquetar).toHaveBeenCalledWith("cat_5000", undefined);
  });

  it("con cero líneas reetiquetables muestra un estado vacío, no una lista rota", () => {
    render(
      <HojaAreas
        abierta={true}
        lineasReetiquetables={[]}
        areas={[crearArea()]}
        error={null}
        onReetiquetar={() => {}}
        onVolver={() => {}}
      />,
    );

    expect(screen.getByText(/no hay productos para reetiquetar/i)).toBeInTheDocument();
  });

  // Antes: reetiquetarLineaEnSesion podía rechazar (categoría fijada por
  // admin, sesión cerrada, área inactiva/inexistente, sucursal equivocada —
  // reetiquetar-linea-en-sesion.test.ts) y el cajero no veía nada. Quien
  // monta HojaAreas (ConteoScreen) hace el try/catch y nos pasa el mensaje
  // ya traducido vía `error`.
  it("muestra el mensaje de error cuando la prop error trae un rechazo", () => {
    render(
      <HojaAreas
        abierta={true}
        lineasReetiquetables={[crearLinea()]}
        areas={[crearArea()]}
        error="No se pudo reetiquetar el área. Intenta de nuevo."
        onReetiquetar={() => {}}
        onVolver={() => {}}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "No se pudo reetiquetar el área. Intenta de nuevo.",
    );
  });

  it('el botón de salida se llama "Volver", nunca "Cerrar" (restricción dura de ConteoScreen.test.tsx)', () => {
    const onVolver = vi.fn();
    render(
      <HojaAreas
        abierta={true}
        lineasReetiquetables={[crearLinea()]}
        areas={[crearArea()]}
        error={null}
        onReetiquetar={() => {}}
        onVolver={onVolver}
      />,
    );

    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^volver$/i }));
    expect(onVolver).toHaveBeenCalledTimes(1);
  });
});
