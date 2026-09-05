// apps/web/src/ui/admin/AreasScreen.test.tsx
import { FakeAdminRepository } from "@conteo/data";
import type { Area } from "@conteo/shared/models/area.js";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
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

function renderPantalla(repo: FakeAdminRepository, onIrACategorias?: () => void) {
  return render(
    <AdminRepositoryProvider repo={repo}>
      <AreasScreen onIrACategorias={onIrACategorias} />
    </AdminRepositoryProvider>,
  );
}

describe("AreasScreen", () => {
  it("lista las áreas sembradas y la columna de categorías", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());

    renderPantalla(repo);

    expect(screen.getByText("Aseo")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Categorías" })).toBeInTheDocument();
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

  it("edita un área existente con el formulario precargado", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase());

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /editar/i }));
    expect(screen.getByLabelText(/nombre/i)).toHaveValue("Aseo");

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: "Aseo y limpieza" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar cambios/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        {
          metodo: "actualizarArea",
          payload: { areaId: "area_aseo", nombre: "Aseo y limpieza" },
        },
      ]);
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

  it("la columna cuenta sólo categorías activas cuyo areaIds incluye el área", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo" }));
    repo.sembrarArea(areaBase({ areaId: "area_vacia", nombre: "Vacía" }));
    // Activa en el área -> cuenta
    repo.sembrarCategoria(
      categoriaBase({ categoriaId: "cat_1", activa: true, areaIds: ["area_aseo"] }),
    );
    // Inactiva en el área -> no cuenta
    repo.sembrarCategoria(
      categoriaBase({ categoriaId: "cat_2", activa: false, areaIds: ["area_aseo"] }),
    );
    // Activa en otra área -> no cuenta para area_aseo
    repo.sembrarCategoria(
      categoriaBase({ categoriaId: "cat_3", activa: true, areaIds: ["area_otra"] }),
    );

    renderPantalla(repo);

    const filaAseo = screen.getByRole("row", { name: /aseo/i });
    expect(filaAseo).toHaveTextContent("1");

    const filaVacia = screen.getByRole("row", { name: /vacía/i });
    expect(filaVacia).toHaveTextContent("0");
  });

  it("ofrece Asignar con nombre accesible descriptivo por fila", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo" }));

    renderPantalla(repo);

    const boton = screen.getByRole("button", { name: "Asignar categorías a Aseo" });
    expect(boton).toBeInTheDocument();
    fireEvent.click(boton);

    expect(screen.getByRole("heading", { name: "Categorías de Aseo" })).toBeInTheDocument();
  });

  it("guardar N categorías emite N actualizarCategoria con areaIds correcto y conservando campos vivos", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo" }));
    repo.sembrarCategoria(
      categoriaBase({
        categoriaId: "cat_1",
        etiqueta: "$1.000",
        valor: 1000,
        orden: 1,
        sucursalesAsignadas: ["suc_1"],
      }),
    );
    repo.sembrarCategoria(
      categoriaBase({
        categoriaId: "cat_2",
        etiqueta: "$2.000",
        valor: 2000,
        orden: 2,
      }),
    );

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: "Asignar categorías a Aseo" }));

    fireEvent.click(screen.getByRole("checkbox", { name: "$1.000" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "$2.000" }));

    fireEvent.click(screen.getByRole("button", { name: /guardar asignación/i }));

    await vi.waitFor(() => {
      expect(repo.llamadas).toEqual([
        {
          metodo: "actualizarCategoria",
          payload: {
            categoriaId: "cat_1",
            etiqueta: "$1.000",
            valor: 1000,
            orden: 1,
            areaIds: ["area_aseo"],
            sucursalesAsignadas: ["suc_1"],
          },
        },
        {
          metodo: "actualizarCategoria",
          payload: {
            categoriaId: "cat_2",
            etiqueta: "$2.000",
            valor: 2000,
            orden: 2,
            areaIds: ["area_aseo"],
          },
        },
      ]);
    });

    expect(screen.queryByRole("heading", { name: "Categorías de Aseo" })).not.toBeInTheDocument();
  });

  it("un fallo parcial deja el formulario abierto con la selección intacta y el mensaje con el conteo real", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo" }));
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_1", etiqueta: "$1.000" }));
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_2", etiqueta: "$2.000" }));

    const actualizarSpy = vi.spyOn(repo, "actualizarCategoria");
    actualizarSpy.mockResolvedValueOnce({ categoriaId: "cat_1", actualizada: true });
    actualizarSpy.mockRejectedValueOnce(new Error("Error de red simulado"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: "Asignar categorías a Aseo" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "$1.000" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "$2.000" }));
    fireEvent.click(screen.getByRole("button", { name: /guardar asignación/i }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent(
      "Se guardaron 1 de 2 categorías. Vuelve a intentar con las que faltaron.",
    );

    expect(screen.getByRole("heading", { name: "Categorías de Aseo" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "$1.000" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "$2.000" })).toBeChecked();
  });

  it("un fallo total muestra el mensaje de error correspondiente", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo" }));
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_1", etiqueta: "$1.000" }));

    vi.spyOn(repo, "actualizarCategoria").mockRejectedValueOnce(new Error("Error total"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: "Asignar categorías a Aseo" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "$1.000" }));
    fireEvent.click(screen.getByRole("button", { name: /guardar asignación/i }));

    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("No se pudo guardar la asignación. Intenta de nuevo.");
  });

  it("aviso pasivo sobre la tabla informa categorías sin área y permite ir a categorías", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo" }));
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_1", areaIds: [] }));
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_2", areaIds: ["area_aseo"] }));

    const onIrACategorias = vi.fn();
    renderPantalla(repo, onIrACategorias);

    const aviso = screen.getByRole("status");
    expect(aviso).toHaveTextContent(
      "1 categorías sin área. Se ven en todas las áreas mientras tanto.",
    );

    fireEvent.click(screen.getByRole("button", { name: /ver categorías/i }));
    expect(onIrACategorias).toHaveBeenCalledTimes(1);
  });

  it("atajos Marcar todas y Desmarcar todas alternan todas las opciones", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo" }));
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_1", etiqueta: "$1.000" }));
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_2", etiqueta: "$2.000" }));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: "Asignar categorías a Aseo" }));

    fireEvent.click(screen.getByRole("button", { name: "Marcar todas" }));
    expect(screen.getByRole("checkbox", { name: "$1.000" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "$2.000" })).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Desmarcar todas" }));
    expect(screen.getByRole("checkbox", { name: "$1.000" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "$2.000" })).not.toBeChecked();
  });

  it("muestra buscador sólo si hay más de 20 categorías activas y filtra la lista", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarArea(areaBase({ areaId: "area_aseo", nombre: "Aseo" }));
    for (let i = 1; i <= 21; i++) {
      repo.sembrarCategoria(categoriaBase({ categoriaId: `cat_${i}`, etiqueta: `Prod ${i}` }));
    }

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: "Asignar categorías a Aseo" }));

    const buscador = screen.getByRole("searchbox");
    expect(buscador).toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: "Prod 21" } });
    expect(screen.getByRole("checkbox", { name: "Prod 21" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Prod 1" })).not.toBeInTheDocument();
  });
});
