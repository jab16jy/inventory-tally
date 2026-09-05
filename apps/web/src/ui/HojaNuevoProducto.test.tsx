// apps/web/src/ui/HojaNuevoProducto.test.tsx — ADR-21 (docs/diseno/13-decisiones-adr.md#adr-21)
// y doc 11 §10 ("Producto creado por error o duplicado"): la confirmación
// explícita antes de escribir es el requisito central de esta hoja.
import { fireEvent, render, screen } from "@testing-library/react";
import { FirebaseError } from "firebase/app";
import { describe, expect, it, vi } from "vitest";
import type { Area } from "@conteo/shared";
import { HojaNuevoProducto } from "./HojaNuevoProducto.js";

function crearArea(overrides: Partial<Area> = {}): Area {
  return {
    areaId: "area_aseo",
    nombre: "Aseo",
    activa: true,
    creadaEn: new Date("2026-01-15T10:00:00Z"),
    ...overrides,
  };
}

describe("HojaNuevoProducto (ADR-21, doc 11 §10)", () => {
  it("no está en el DOM visible cuando abierta=false", () => {
    render(<HojaNuevoProducto abierta={false} areas={[]} onCrear={vi.fn()} onVolver={() => {}} />);
    expect(screen.queryByText("Nuevo producto")).not.toBeVisible();
  });

  it('"Continuar" está deshabilitado con el nombre vacío', () => {
    render(<HojaNuevoProducto abierta={true} areas={[]} onCrear={vi.fn()} onVolver={() => {}} />);
    expect(screen.getByRole("button", { name: /continuar/i })).toBeDisabled();
  });

  it('el diálogo de confirmación usa role="status", nunca role="alert"', () => {
    render(<HojaNuevoProducto abierta={true} areas={[]} onCrear={vi.fn()} onVolver={() => {}} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));

    expect(screen.getByRole("status")).toHaveTextContent("¿Crear el producto «Bolsas»?");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it('"Corregir" vuelve al formulario conservando el texto escrito', () => {
    render(<HojaNuevoProducto abierta={true} areas={[]} onCrear={vi.fn()} onVolver={() => {}} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /corregir/i }));

    expect(screen.getByLabelText(/nombre/i)).toHaveValue("Bolsas");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it('"Sí, crear" llama a onCrear con la etiqueta y el área elegida (o undefined si "Sin área")', async () => {
    const onCrear = vi.fn().mockResolvedValue(undefined);
    render(
      <HojaNuevoProducto
        abierta={true}
        areas={[crearArea()]}
        onCrear={onCrear}
        onVolver={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.change(screen.getByLabelText(/área/i), { target: { value: "area_aseo" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    // La callable no se ha llamado todavía: falta la confirmación.
    expect(onCrear).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /sí, crear/i }));

    expect(onCrear).toHaveBeenCalledTimes(1);
    expect(onCrear).toHaveBeenCalledWith("Bolsas", "area_aseo", undefined);
  });

  it('"Sí, crear" llama a onCrear con el precio cuando el cajero lo escribe (D-9, ADR-23)', async () => {
    const onCrear = vi.fn().mockResolvedValue(undefined);
    render(
      <HojaNuevoProducto
        abierta={true}
        areas={[crearArea()]}
        onCrear={onCrear}
        onVolver={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "5000" } });
    fireEvent.change(screen.getByLabelText(/área/i), { target: { value: "area_aseo" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, crear/i }));

    expect(onCrear).toHaveBeenCalledWith("Bolsas", "area_aseo", 5000);
  });

  it("un precio negativo o decimal NO se envía (D-9): el payload OMITE `valor`", async () => {
    const onCrear = vi.fn().mockResolvedValue(undefined);
    render(<HojaNuevoProducto abierta={true} areas={[]} onCrear={onCrear} onVolver={() => {}} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.change(screen.getByLabelText(/precio/i), { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, crear/i }));

    expect(onCrear).toHaveBeenCalledWith("Bolsas", undefined, undefined);
  });

  it("mientras la escritura está en vuelo muestra el spinner sin ocultar el texto del botón", async () => {
    let resolverCreacion!: () => void;
    const onCrear = vi.fn(() => new Promise<void>((resolve) => (resolverCreacion = resolve)));
    render(<HojaNuevoProducto abierta={true} areas={[]} onCrear={onCrear} onVolver={() => {}} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, crear/i }));

    const boton = screen.getByRole("button", { name: /sí, crear/i });
    expect(boton).toBeDisabled();

    resolverCreacion();
    await Promise.resolve();
  });

  it("fix(web) · un rechazo genérico se loguea y muestra el mensaje genérico (camino antes sin cobertura)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fallo = new Error("network error simulado");
    const onCrear = vi.fn().mockRejectedValue(fallo);
    render(<HojaNuevoProducto abierta={true} areas={[]} onCrear={onCrear} onVolver={() => {}} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, crear/i }));

    expect(await screen.findByText(/no se pudo crear el producto/i)).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), fallo);
    consoleError.mockRestore();
  });

  it("fix(web) · un área ya no disponible en el servidor muestra un mensaje DISTINTO del genérico", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const fallo = new FirebaseError("functions/not-found", "Área inexistente");
    const onCrear = vi.fn().mockRejectedValue(fallo);
    render(
      <HojaNuevoProducto
        abierta={true}
        areas={[crearArea()]}
        onCrear={onCrear}
        onVolver={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bolsas" } });
    fireEvent.change(screen.getByLabelText(/área/i), { target: { value: "area_aseo" } });
    fireEvent.click(screen.getByRole("button", { name: /continuar/i }));
    fireEvent.click(screen.getByRole("button", { name: /sí, crear/i }));

    const mensaje = await screen.findByText(/el área elegida ya no existe/i);
    expect(mensaje).toBeInTheDocument();
    expect(screen.queryByText(/no se pudo crear el producto/i)).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});
