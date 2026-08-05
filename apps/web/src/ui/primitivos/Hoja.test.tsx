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

  it("sin promedioCategoria (prop opcional, comportamiento previo a F4-A1), guarda directo sin confirmar", () => {
    const onConfirmar = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        onConfirmar={onConfirmar}
        onVolver={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

    expect(onConfirmar).toHaveBeenCalledWith(999);
  });

  describe("confirmación suave si supera 10× el promedio (F4-A1, doc 10 §10)", () => {
    it("tocar Guardar con una cantidad > 10× el promedio pide confirmar en vez de guardar directo", () => {
      const onConfirmar = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          promedioCategoria={10}
          onConfirmar={onConfirmar}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

      expect(onConfirmar).not.toHaveBeenCalled();
      expect(screen.getByText(/mucho más que el promedio/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /sí, guardar/i })).toBeInTheDocument();
    });

    it('"Sí, guardar" en la confirmación sí registra la cantidad tecleada', () => {
      const onConfirmar = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          promedioCategoria={10}
          onConfirmar={onConfirmar}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
      fireEvent.click(screen.getByRole("button", { name: /sí, guardar/i }));

      expect(onConfirmar).toHaveBeenCalledWith(500);
    });

    it('"Corregir" vuelve al teclado sin guardar ni perder lo tecleado', () => {
      const onConfirmar = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          promedioCategoria={10}
          onConfirmar={onConfirmar}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
      fireEvent.click(screen.getByRole("button", { name: /corregir/i }));

      expect(onConfirmar).not.toHaveBeenCalled();
      expect(screen.getByTestId("hoja-valor")).toHaveTextContent("500");
      // El teclado numérico está de vuelta.
      expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    });

    it("una cantidad por debajo del umbral guarda directo, sin pedir confirmación", () => {
      const onConfirmar = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          promedioCategoria={10}
          onConfirmar={onConfirmar}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "8" }));
      fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

      expect(onConfirmar).toHaveBeenCalledWith(8);
    });

    it("nunca añade un segundo role=alert (restricción de ConteoScreen.test.tsx)", () => {
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          promedioCategoria={10}
          onConfirmar={() => {}}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("deja el foco en «Corregir» al entrar en la confirmación", () => {
      // El botón "Guardar" que tenía el foco se DESMONTA al cambiar de
      // vista, así que sin esto el foco cae al <body> y quien navega por
      // teclado tiene que rebuscar dónde quedó dentro del diálogo. Aterriza
      // en "Corregir" y no en "Sí, guardar" a propósito: el foco por defecto
      // no debe estar sobre la acción que confirma un número sospechoso.
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          promedioCategoria={10}
          onConfirmar={() => {}}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /guardar/i }));

      expect(screen.getByRole("button", { name: /corregir/i })).toHaveFocus();
    });
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
