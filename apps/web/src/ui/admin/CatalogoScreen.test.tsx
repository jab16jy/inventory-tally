// apps/web/src/ui/admin/CatalogoScreen.test.tsx — Unidad 1.3: Categorías y
// Áreas fusionadas como pestañas de una sola pantalla (mismo criterio que
// AdminLayout.test.tsx: sin montar router, AreasScreen/CategoriasScreen
// tampoco lo hacen).
import { FakeAdminRepository } from "@conteo/data";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminRepositoryProvider } from "../../state/admin-contexto.js";
import { CatalogoScreen } from "./CatalogoScreen.js";

function renderPantalla(repo: FakeAdminRepository = new FakeAdminRepository()) {
  return render(
    <AdminRepositoryProvider repo={repo}>
      <CatalogoScreen />
    </AdminRepositoryProvider>,
  );
}

describe("CatalogoScreen", () => {
  it("muestra Categorías por defecto", () => {
    renderPantalla();

    expect(screen.getByRole("tab", { name: "Categorías" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Categorías" })).toBeInTheDocument();
  });

  it("cambia a Áreas al activar su pestaña", () => {
    renderPantalla();

    fireEvent.click(screen.getByRole("tab", { name: "Áreas" }));

    expect(screen.getByRole("tab", { name: "Áreas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Áreas" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Categorías" })).not.toBeInTheDocument();
  });

  // La mitad del patrón de pestañas (tab sin panel) anuncia un control que
  // no lleva a ninguna parte: este caso fija la asociación, no el markup.
  it("asocia cada pestaña con su panel", () => {
    renderPantalla();

    const pestana = screen.getByRole("tab", { name: "Categorías" });
    const panel = screen.getByRole("tabpanel");

    expect(pestana).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", pestana.id);
  });

  it("permite volver a Categorías desde el aviso de sin-área en Áreas", () => {
    const repo = new FakeAdminRepository();
    repo.sembrarCategoria({
      categoriaId: "cat_1",
      etiqueta: "$1.000",
      valor: 1000,
      activa: true,
      orden: 1,
      creadaEn: new Date(),
    });
    renderPantalla(repo);

    fireEvent.click(screen.getByRole("tab", { name: "Áreas" }));
    expect(screen.getByRole("tab", { name: "Áreas" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("button", { name: /ver categorías/i }));
    expect(screen.getByRole("tab", { name: "Categorías" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("heading", { name: "Categorías" })).toBeInTheDocument();
  });
});
