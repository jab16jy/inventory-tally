// apps/web/src/ui/admin/AreasScreen.test.tsx
import { FakeAdminRepository } from "@conteo/data";
import type { Area } from "@conteo/shared/models/area.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { AreasScreen } from "./AreasScreen.js";

function areaBase(overrides: Partial<Area> = {}): Area {
  return {
    areaId: "area_aseo",
    nombre: "Aseo",
    activa: true,
    creadaEn: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function renderPantalla(repo: FakeAdminRepository) {
  return render(
    <AdminRepositoryProvider repo={repo}>
      <AreasScreen />
    </AdminRepositoryProvider>,
  );
}

describe("AreasScreen", () => {
  it("lista las áreas sembradas", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());

    renderPantalla(repo);

    expect(screen.getByText("Aseo")).toBeInTheDocument();
  });

  it("crea un área con el formulario", async () => {
    const repo = new FakeAdminRepository();

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /nueva área/i }));
    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Bebidas" } });
    fireEvent.click(screen.getByRole("button", { name: /crear área/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([{ metodo: "crearArea", payload: { nombre: "Bebidas" } }]);
    });
  });

  it("ofrece desactivar y eliminar sólo a las áreas activas, reactivar sólo a las inactivas", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_activa", nombre: "Activa" }));
    repo.sembrarArea(areaBase({ areaId: "area_inactiva", nombre: "Inactiva", activa: false }));

    renderPantalla(repo);

    expect(screen.getAllByRole("button", { name: /desactivar/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^eliminar$/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^reactivar$/i })).toHaveLength(1);
  });

  it("desactiva un área existente", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /desactivar/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        { metodo: "desactivarArea", payload: { areaId: "area_aseo" } },
      ]);
    });
  });

  it("pide confirmación con aviso de irreversibilidad antes de eliminar", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));

    expect(
      screen.getByText(/¿eliminar aseo permanentemente\? no se puede deshacer\./i),
    ).toBeInTheDocument();
  });

  it("elimina un área existente", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([{ metodo: "eliminarArea", payload: { areaId: "area_aseo" } }]);
    });
  });

  it("reactiva un área existente", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ activa: false }));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^reactivar$/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        { metodo: "reactivarArea", payload: { areaId: "area_aseo" } },
      ]);
    });
  });

  it("muestra el mensaje de la guarda del servidor tal cual cuando falla eliminar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());
    repo.eliminarArea = vi
      .fn()
      .mockRejectedValue(new Error("No se puede eliminar: usada en 2 categorías."));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se puede eliminar: usada en 2 categorías.",
    );
  });

  it("deshabilita Desactivar y muestra el spinner mientras la acción está en vuelo", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());
    repo.desactivarArea = vi.fn(() => new Promise<never>(() => {}));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /desactivar/i }));

    const boton = screen.getByRole("button", { name: /desactivar/i });
    expect(boton).toBeDisabled();
    expect(boton.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("deshabilita Confirmar y muestra el spinner mientras eliminar está en vuelo", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());
    repo.eliminarArea = vi.fn(() => new Promise<never>(() => {}));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    const boton = screen.getByRole("button", { name: /confirmar/i });
    expect(boton).toBeDisabled();
    expect(boton.querySelector("svg")).toHaveClass("animate-spin");
  });
});
