// apps/web/src/ui/admin/CategoriasScreen.test.tsx
// (docs/plan-panel-administrador.md §5, fase F3; ticket #39 D4/D6)
import { FakeAdminRepository } from "@conteo/data";
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import type { Sucursal } from "@conteo/shared/models/sucursal.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { CategoriasScreen } from "./CategoriasScreen.js";

function sucursalBase(overrides: Partial<Sucursal> = {}): Sucursal {
  return {
    sucursalId: "suc_norte",
    nombre: "Norte",
    direccion: "Calle 1",
    conectividad: "wifi",
    activa: true,
    sesionAbiertaId: null,
    creadaEn: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function categoriaBase(overrides: Partial<CategoriaValor> = {}): CategoriaValor {
  return {
    categoriaId: "cat_5000",
    etiqueta: "$5.000",
    valor: 5000,
    activa: true,
    orden: 1,
    creadaEn: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

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
      <CategoriasScreen />
    </AdminRepositoryProvider>,
  );
}

describe("CategoriasScreen (F3)", () => {
  it("lista las categorías sembradas con el valor formateado en pesos", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());

    renderPantalla(repo);

    expect(screen.getByText("$5.000")).toBeInTheDocument();
    // Espacio normal a propósito, no el U+00A0 que Intl inserta entre "$" y
    // la cifra: `getByText` normaliza el espacio del DOM antes de comparar,
    // no el literal del test (mismo criterio que PanelScreen.test.tsx).
    expect(screen.getByText("$ 5.000")).toBeInTheDocument();
  });

  it("crea una categoría con el formulario", async () => {
    const repo = new FakeAdminRepository();

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /nueva categoría/i }));
    fireEvent.change(screen.getByLabelText(/etiqueta/i), { target: { value: "$10.000" } });
    fireEvent.change(screen.getByLabelText(/^valor$/i), { target: { value: "10000" } });
    fireEvent.change(screen.getByLabelText(/orden/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /crear categoría/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        { metodo: "crearCategoria", payload: { etiqueta: "$10.000", valor: 10000, orden: 2 } },
      ]);
    });
  });

  it("crea una categoría global cuando no se marca ninguna sucursal (D6: comportamiento actual, sin cambios)", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_norte", nombre: "Norte" }));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /nueva categoría/i }));
    fireEvent.change(screen.getByLabelText(/etiqueta/i), { target: { value: "$10.000" } });
    fireEvent.change(screen.getByLabelText(/^valor$/i), { target: { value: "10000" } });
    fireEvent.change(screen.getByLabelText(/orden/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /crear categoría/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        { metodo: "crearCategoria", payload: { etiqueta: "$10.000", valor: 10000, orden: 2 } },
      ]);
    });
  });

  it("crea una categoría por sucursal cuando se marcan sucursales (D4/D6: catálogo nombrado)", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_norte", nombre: "Norte" }));
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_centro", nombre: "Centro" }));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /nueva categoría/i }));
    fireEvent.change(screen.getByLabelText(/etiqueta/i), {
      target: { value: "Refrigerador X200" },
    });
    fireEvent.change(screen.getByLabelText(/^valor$/i), { target: { value: "45000" } });
    fireEvent.change(screen.getByLabelText(/orden/i), { target: { value: "1" } });
    fireEvent.click(screen.getByLabelText("Norte"));
    fireEvent.click(screen.getByRole("button", { name: /crear categoría/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        {
          metodo: "crearCategoria",
          payload: {
            etiqueta: "Refrigerador X200",
            valor: 45000,
            orden: 1,
            sucursalesAsignadas: ["suc_norte"],
          },
        },
      ]);
    });
  });

  it("crea una categoría con área seleccionada y resuelve el nombre en la tabla", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());
    repo.sembrarCategoria(categoriaBase({ areaId: "area_aseo" }));

    renderPantalla(repo);

    expect(screen.getByText("Aseo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /nueva categoría/i }));
    fireEvent.change(screen.getByLabelText(/etiqueta/i), { target: { value: "$10.000" } });
    fireEvent.change(screen.getByLabelText(/^valor$/i), { target: { value: "10000" } });
    fireEvent.change(screen.getByLabelText(/orden/i), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(/área/i), { target: { value: "area_aseo" } });
    fireEvent.click(screen.getByRole("button", { name: /crear categoría/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        {
          metodo: "crearCategoria",
          payload: { etiqueta: "$10.000", valor: 10000, orden: 2, areaId: "area_aseo" },
        },
      ]);
    });
  });

  it("edita una categoría existente con el formulario precargado", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());
    repo.sembrarCategoria(
      categoriaBase({ areaId: "area_aseo", sucursalesAsignadas: ["suc_norte"] }),
    );
    repo.sembrarSucursal(sucursalBase({ sucursalId: "suc_norte", nombre: "Norte" }));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByLabelText(/etiqueta/i)).toHaveValue("$5.000");
    expect(screen.getByLabelText(/^valor$/i)).toHaveValue(5000);
    expect(screen.getByLabelText(/orden/i)).toHaveValue(1);
    expect(screen.getByLabelText(/área/i)).toHaveValue("area_aseo");
    expect(screen.getByLabelText("Norte")).toBeChecked();

    fireEvent.change(screen.getByLabelText(/etiqueta/i), { target: { value: "$6.000" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        {
          metodo: "actualizarCategoria",
          payload: {
            categoriaId: "cat_5000",
            etiqueta: "$6.000",
            valor: 5000,
            orden: 1,
            areaId: "area_aseo",
            sucursalesAsignadas: ["suc_norte"],
          },
        },
      ]);
    });
  });

  it("no ofrece áreas inactivas en el selector del formulario (evitaría degradar a 'Sin área' al abrir sesión)", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo", activa: true }));
    repo.sembrarArea(areaBase({ areaId: "area_vieja", nombre: "Vieja", activa: false }));

    renderPantalla(repo);
    fireEvent.click(screen.getByRole("button", { name: /nueva categoría/i }));

    const opciones = screen.getAllByRole("option").map((o) => o.textContent);
    expect(opciones).toContain("Aseo");
    expect(opciones).not.toContain("Vieja");
  });

  it("ofrece desactivar y eliminar sólo a las categorías activas, reactivar sólo a las inactivas", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_activa", etiqueta: "Activa" }));
    repo.sembrarCategoria(
      categoriaBase({ categoriaId: "cat_inactiva", etiqueta: "Inactiva", activa: false }),
    );

    renderPantalla(repo);

    expect(screen.getAllByRole("button", { name: /desactivar/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^eliminar$/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^reactivar$/i })).toHaveLength(1);
  });

  it("pide confirmación con aviso de irreversibilidad antes de eliminar", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));

    expect(
      screen.getByText(/¿eliminar \$5\.000 permanentemente\? no se puede deshacer\./i),
    ).toBeInTheDocument();
  });

  it("elimina una categoría existente", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        { metodo: "eliminarCategoria", payload: { categoriaId: "cat_5000" } },
      ]);
    });
  });

  it("reactiva una categoría existente", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase({ activa: false }));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^reactivar$/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        { metodo: "reactivarCategoria", payload: { categoriaId: "cat_5000" } },
      ]);
    });
  });

  it("muestra el mensaje de la guarda del servidor tal cual cuando falla eliminar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());
    repo.eliminarCategoria = vi
      .fn()
      .mockRejectedValue(new Error("No se puede eliminar: usada en 3 conteos."));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se puede eliminar: usada en 3 conteos.",
    );
  });

  it("deshabilita Confirmar y muestra el spinner mientras eliminar está en vuelo", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());
    repo.eliminarCategoria = vi.fn(() => new Promise<never>(() => {}));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirmar/i }));

    const boton = screen.getByRole("button", { name: /confirmar/i });
    expect(boton).toBeDisabled();
    expect(boton.querySelector("svg")).toHaveClass("animate-spin");
  });

  it("muestra el error del servidor cuando falla desactivar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());
    repo.desactivarCategoria = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /desactivar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo desactivar/i);
  });

  it("sigue mostrando el esqueleto de carga mientras observarAreas no resuelve, aunque observarCategorias ya haya resuelto (issue #52)", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());
    repo.observarAreas = vi.fn(() => () => {});

    renderPantalla(repo);

    expect(await screen.findAllByTestId("fila-esqueleto")).not.toHaveLength(0);
    expect(screen.queryByText("$5.000")).not.toBeInTheDocument();
  });

  it("deshabilita Desactivar y muestra el spinner mientras la acción está en vuelo", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());
    repo.desactivarCategoria = vi.fn(() => new Promise<never>(() => {}));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /desactivar/i }));

    const boton = screen.getByRole("button", { name: /desactivar/i });
    expect(boton).toBeDisabled();
    expect(boton.querySelector("svg")).toHaveClass("animate-spin");
  });
});
