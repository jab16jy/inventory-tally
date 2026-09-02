// apps/web/src/ui/LayoutCajero.test.tsx
// LayoutCajero (doc 11 §2) — el cajero navega por pestañas
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { LayoutCajero } from "./LayoutCajero.js";

function renderLayout(rutaInicial: string) {
  return render(
    <MemoryRouter initialEntries={[rutaInicial]}>
      <Routes>
        <Route path="/" element={<LayoutCajero />}>
          <Route path="sucursales" element={<p>stub</p>} />
          <Route path="mis-conteos" element={<p>stub</p>} />
          <Route path="mis-conteos/:sesionId" element={<p>stub</p>} />
          <Route path="cuenta" element={<p>stub</p>} />
        </Route>
        {/* Rutas de conteo FUERA del layout: la barra inferior no debe
            aparecer ahí (doc 11 — el cajero está concentrado en una tarea,
            no navegando pestañas). */}
        <Route path="/conteo/:sesionId" element={<p>stub conteo</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LayoutCajero (doc 11 §2) — el cajero navega por pestañas", () => {
  it("renderiza la barra inferior con los tres destinos del cajero", () => {
    renderLayout("/sucursales");

    const nav = screen.getByRole("navigation", { name: /secciones/i });
    const enlaces = within(nav).getAllByRole("link");
    expect(enlaces).toHaveLength(3);

    expect(within(nav).getByRole("link", { name: /^conteos$/i })).toHaveAttribute(
      "href",
      "/sucursales",
    );
    expect(within(nav).getByRole("link", { name: /mis conteos/i })).toHaveAttribute(
      "href",
      "/mis-conteos",
    );
    expect(within(nav).getByRole("link", { name: /^cuenta$/i })).toHaveAttribute("href", "/cuenta");
  });

  it("marca 'Mis conteos' como página actual en /mis-conteos", () => {
    renderLayout("/mis-conteos");

    expect(screen.getByRole("link", { name: /mis conteos/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("también marca 'Mis conteos' como actual en /mis-conteos/:sesionId (sin `end`)", () => {
    // Par afirmativo del test anterior (AGENTS.md §2): si `end` estuviera
    // puesto, este caso fallaría y el de arriba seguiría pasando — sólo los
    // dos juntos demuestran que la ausencia de `end` es intencional.
    renderLayout("/mis-conteos/ses_1");

    expect(screen.getByRole("link", { name: /mis conteos/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("no renderiza la barra inferior fuera del layout, y sí dentro", () => {
    renderLayout("/conteo/ses_1");
    expect(screen.queryByRole("navigation", { name: /secciones/i })).toBeNull();

    renderLayout("/sucursales");
    expect(screen.getByRole("navigation", { name: /secciones/i })).toBeInTheDocument();
  });

  it("ningún enlace de la barra se llama 'Salir' ni matchea /cerrar|descartar/i", () => {
    renderLayout("/sucursales");

    const nav = screen.getByRole("navigation", { name: /secciones/i });
    expect(within(nav).queryByRole("link", { name: /cerrar|descartar/i })).toBeNull();
    expect(within(nav).queryByRole("button", { name: /cerrar|descartar/i })).toBeNull();
    expect(within(nav).queryByRole("link", { name: /^salir$/i })).toBeNull();
    expect(within(nav).queryByRole("button", { name: /^salir$/i })).toBeNull();
  });

  it("cada enlace de la barra cumple el objetivo táctil mínimo (doc 11 §9)", () => {
    renderLayout("/sucursales");

    const nav = screen.getByRole("navigation", { name: /secciones/i });
    for (const enlace of within(nav).getAllByRole("link")) {
      expect(enlace.className).toContain("min-h-[var(--size-toque)]");
    }
  });
});
