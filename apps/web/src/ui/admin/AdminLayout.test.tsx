// apps/web/src/ui/admin/AdminLayout.test.tsx
// (docs/plan-panel-administrador.md §5, fase F1)
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AdminLayout } from "./AdminLayout.js";

function renderLayout(rutaInicial: string) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout onSalir={vi.fn()} />}>
          <Route index element={<p>Panel — contenido</p>} />
          <Route path="cajeros" element={<p>Cajeros — contenido</p>} />
          <Route path="sucursales" element={<p>Sucursales — contenido</p>} />
          <Route path="categorias" element={<p>Categorías — contenido</p>} />
          <Route path="sesiones" element={<p>Sesiones — contenido</p>} />
          <Route path="auditoria" element={<p>Auditoría — contenido</p>} />
          <Route path="comparativo" element={<p>Comparativo — contenido</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AdminLayout (F1)", () => {
  it("marca como actual el enlace de la ruta activa", () => {
    renderLayout("/admin/cajeros");

    expect(screen.getByRole("link", { name: /cajeros/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: /^panel$/i })).not.toHaveAttribute("aria-current");
  });

  it("lista los siete destinos del panel", () => {
    renderLayout("/admin");

    const nav = screen.getByRole("navigation", { name: /panel de administrador/i });
    const enlaces = within(nav).getAllByRole("link");
    expect(enlaces).toHaveLength(7);

    for (const nombre of [
      "Panel",
      "Cajeros",
      "Sucursales",
      "Categorías",
      "Sesiones",
      "Auditoría",
      "Comparativo",
    ]) {
      expect(within(nav).getByRole("link", { name: nombre })).toBeInTheDocument();
    }
  });

  it("ofrece un control de salida visible que no se llama 'Cerrar sesión'", () => {
    renderLayout("/admin");

    const boton = screen.getByRole("button", { name: /salir/i });
    expect(boton).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();
  });
});
