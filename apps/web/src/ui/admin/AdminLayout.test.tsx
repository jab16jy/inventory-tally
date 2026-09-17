// apps/web/src/ui/admin/AdminLayout.test.tsx
// (docs/plan-panel-administrador.md §5, fase F1; issue #20 item 1 para los 3
// breakpoints de doc 11 §298-304)
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminLayout } from "./AdminLayout.js";

const ANCHO_ORIGINAL = window.innerWidth;

function fijarAncho(ancho: number): void {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: ancho });
}

afterEach(() => {
  fijarAncho(ANCHO_ORIGINAL);
});

function renderLayout(rutaInicial: string, onSalir = vi.fn(), rol?: string) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout onSalir={onSalir} rol={rol} />}>
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

    expect(screen.getByRole("link", { name: /cajeros/i })).toHaveAttribute("aria-current", "page");
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

  it("al tocar Salir, todavía NO llama a onSalir sin confirmar (mismo criterio que BotonSalir, issue #72)", () => {
    const onSalir = vi.fn();
    renderLayout("/admin", onSalir);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));

    expect(onSalir).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("confirmar dentro del diálogo llama a onSalir", () => {
    const onSalir = vi.fn();
    renderLayout("/admin", onSalir);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^salir$/i }));

    expect(onSalir).toHaveBeenCalledTimes(1);
  });

  it("cancelar en el diálogo cierra sin llamar a onSalir", () => {
    const onSalir = vi.fn();
    renderLayout("/admin", onSalir);

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancelar/i }));

    expect(onSalir).not.toHaveBeenCalled();
  });

  it("el diálogo de salida va centrado (m-auto: el preflight anula el margin:auto del UA)", () => {
    renderLayout("/admin");

    fireEvent.click(screen.getByRole("button", { name: /^salir$/i }));

    expect(screen.getByRole("dialog")).toHaveClass("m-auto");
  });
});

describe("AdminLayout · alcance por rol (S5c, D8)", () => {
  it("oculta el destino Comparativo para admin_sucursal", () => {
    renderLayout("/admin", vi.fn(), "admin_sucursal");

    const nav = screen.getByRole("navigation", { name: /panel de administrador/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(6);
    expect(within(nav).queryByRole("link", { name: /comparativo/i })).not.toBeInTheDocument();
  });

  it("mantiene los siete destinos, incluido Comparativo, para Gerente", () => {
    renderLayout("/admin", vi.fn(), "admin");

    const nav = screen.getByRole("navigation", { name: /panel de administrador/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    expect(within(nav).getByRole("link", { name: /comparativo/i })).toBeInTheDocument();
  });
});

describe("AdminLayout · breakpoints (issue #20 item 1, doc 11 §298-304)", () => {
  it("< 600px: navegación inferior, sin sidebar lateral", () => {
    fijarAncho(375);
    renderLayout("/admin");

    const nav = screen.getByRole("navigation", { name: /panel de administrador/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    // La cabecera "Panel administrador" sólo existe en el sidebar lateral.
    expect(screen.queryByText("Panel administrador")).not.toBeInTheDocument();
  });

  it("600–1024px: sidebar de sólo íconos, sin etiquetas de texto", () => {
    fijarAncho(800);
    renderLayout("/admin");

    const nav = screen.getByRole("navigation", { name: /panel de administrador/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    // Las etiquetas de texto de los destinos no se pintan a este ancho.
    expect(screen.queryByText("Cajeros")).not.toBeInTheDocument();
    expect(screen.queryByText("Panel administrador")).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: /cajeros/i })).toHaveAttribute("title", "Cajeros");
  });

  it("> 1024px: sidebar completo con etiquetas (comportamiento histórico)", () => {
    fijarAncho(1440);
    renderLayout("/admin");

    const nav = screen.getByRole("navigation", { name: /panel de administrador/i });
    expect(within(nav).getAllByRole("link")).toHaveLength(7);
    expect(screen.getByText("Panel administrador")).toBeInTheDocument();
    expect(within(nav).getByText("Cajeros")).toBeInTheDocument();
  });
});

describe("AdminLayout · impresión", () => {
  it("el sidebar de escritorio lleva print:hidden", () => {
    fijarAncho(1440);
    renderLayout("/admin");

    const nav = screen.getByRole("navigation", { name: /panel de administrador/i });
    expect(nav).toHaveClass("print:hidden");
  });

  it("la barra inferior móvil también lleva print:hidden", () => {
    fijarAncho(375);
    renderLayout("/admin");

    const nav = screen.getByRole("navigation", { name: /panel de administrador/i });
    expect(nav).toHaveClass("print:hidden");
  });
});
