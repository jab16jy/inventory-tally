import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BarraProgreso } from "./BarraProgreso.js";

describe("BarraProgreso", () => {
  it("muestra contadas/total en texto", () => {
    render(<BarraProgreso contadas={47} total={60} />);
    expect(screen.getByText("47/60")).toBeInTheDocument();
  });

  it("expone el progreso por aria para lectores de pantalla", () => {
    render(<BarraProgreso contadas={47} total={60} />);
    const barra = screen.getByRole("progressbar");
    expect(barra).toHaveAttribute("aria-valuenow", "47");
    expect(barra).toHaveAttribute("aria-valuemax", "60");
  });

  it("no revienta con total 0 (sesión recién abierta)", () => {
    render(<BarraProgreso contadas={0} total={0} />);
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });
});
