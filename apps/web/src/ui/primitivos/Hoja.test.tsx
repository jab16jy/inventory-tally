// Bottom sheet sobre <dialog> nativo con teclado numérico (plan §3/§5): el
// camino PRINCIPAL de captura es tocar la fila, no los botones −/+.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Hoja } from "./Hoja.js";

describe("Hoja", () => {
  it("no está en el DOM visible cuando abierta=false", () => {
    render(
      <Hoja
        abierta={false}
        etiqueta="$5.000"
        valorInicial={0}
        onConfirmar={() => {}}
        onVolver={() => {}}
      />,
    );
    // <dialog> sin abrir no se considera visible.
    expect(screen.queryByText("$5.000")).not.toBeVisible();
  });

  it("precarga el valor actual y permite escribir uno nuevo con el teclado", () => {
    const onConfirmar = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={12}
        onConfirmar={onConfirmar}
        onVolver={() => {}}
      />,
    );

    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("12");

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("30");

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    expect(onConfirmar).toHaveBeenCalledWith(30);
  });

  it("borrar quita el último dígito y nunca deja el campo vacío", () => {
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={5}
        onConfirmar={() => {}}
        onVolver={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /borrar/i }));
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: /borrar/i }));
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
  });

  it('el botón para cerrar se llama "Volver", nunca "Cerrar" (restricción de ConteoScreen.test.tsx)', () => {
    const onVolver = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        onConfirmar={() => {}}
        onVolver={onVolver}
      />,
    );
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /volver/i }));
    expect(onVolver).toHaveBeenCalledOnce();
  });
});
