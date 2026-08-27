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
      expect(repo.llamadas).toEqual([
        { metodo: "crearArea", payload: { nombre: "Bebidas" } },
      ]);
    });
  });

  it("ofrece desactivar sólo a las áreas activas", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_activa", nombre: "Activa" }));
    repo.sembrarArea(areaBase({ areaId: "area_inactiva", nombre: "Inactiva", activa: false }));

    renderPantalla(repo);

    expect(screen.getAllByRole("button", { name: /desactivar/i })).toHaveLength(1);
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
});
