// apps/web/src/ui/admin/CategoriasScreen.test.tsx
// (docs/plan-panel-administrador.md §5, fase F3)
import { FakeAdminRepository } from "@conteo/data";
import type { CategoriaValor } from "@conteo/shared/models/categoria-valor.js";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { CategoriasScreen } from "./CategoriasScreen.js";

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

  it("ofrece desactivar sólo a las categorías activas", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase({ categoriaId: "cat_activa", etiqueta: "Activa" }));
    repo.sembrarCategoria(
      categoriaBase({ categoriaId: "cat_inactiva", etiqueta: "Inactiva", activa: false }),
    );

    renderPantalla(repo);

    // Sólo una fila (la activa) puede ofrecer "Desactivar"; la inactiva no
    // tiene ninguna acción disponible porque `reactivarCategoria` no existe.
    expect(screen.getAllByRole("button", { name: /desactivar/i })).toHaveLength(1);
  });

  it("muestra el error del servidor cuando falla desactivar", async () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria(categoriaBase());
    repo.desactivarCategoria = vi.fn().mockRejectedValue(new Error("network"));

    renderPantalla(repo);

    fireEvent.click(screen.getByRole("button", { name: /desactivar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no se pudo desactivar/i);
  });
});
