// apps/web/src/ui/primitivos/Spinner.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Spinner } from "./Spinner.js";

describe("Spinner", () => {
  it("es un svg animado y oculto para lectores de pantalla", () => {
    render(<Spinner />);
    const svg = document.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg.getAttribute("class")).toContain("animate-spin");
  });

  it("acepta className adicional sin perder animate-spin", () => {
    render(<Spinner className="size-4" />);
    const svg = document.querySelector("svg")!;
    expect(svg.getAttribute("class")).toContain("animate-spin");
    expect(svg.getAttribute("class")).toContain("size-4");
  });

  it("se antepone al texto del botón sin cambiar su nombre accesible", () => {
    // Restricción crítica (DESIGN.md — "Botón primario"): el spinner nunca
    // reemplaza el texto, o rompe los `getByRole("button", { name })` que
    // fijan el markup en todo el repo.
    render(
      <button type="button">
        <Spinner />
        Guardar
      </button>,
    );
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();
  });
});
