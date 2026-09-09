// apps/web/src/ui/ErrorBoundary.test.tsx — issue #17. Fija el markup del
// fallback: es la única salida que le queda al cajero cuando una pantalla
// revienta a media jornada de conteo.
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary.js";

function Revienta(): never {
  throw new Error("fallo de render");
}

describe("ErrorBoundary (issue #17)", () => {
  beforeEach(() => {
    // React vuelca en consola toda excepción que captura un boundary. Estos
    // tests la provocan a propósito, así que se silencia para no ensuciar la
    // salida de la suite con un fallo que sí es el esperado.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sin excepción: renderiza los hijos intactos", () => {
    render(
      <ErrorBoundary>
        <p>App</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText("App")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("un hijo que lanza en render deja el fallback, no un árbol vacío", () => {
    render(
      <ErrorBoundary>
        <Revienta />
        <p>App</p>
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(/no se pudo mostrar/i);
    expect(screen.queryByText("App")).not.toBeInTheDocument();
  });

  it("el fallback ofrece recargar y le deja el foco a ese botón", () => {
    render(
      <ErrorBoundary>
        <Revienta />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("button", { name: /recargar/i })).toHaveFocus();
  });

  it("el mensaje es para un cajero: no filtra el detalle técnico de la excepción", () => {
    render(
      <ErrorBoundary>
        <Revienta />
      </ErrorBoundary>,
    );

    expect(screen.queryByText(/fallo de render/)).not.toBeInTheDocument();
  });
});
