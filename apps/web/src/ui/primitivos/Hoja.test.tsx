// Bottom sheet sobre <dialog> nativo con teclado numérico (plan §3/§5): el
// camino PRINCIPAL de captura es tocar la fila, no los botones −/+.
//
// ADR-24 (conteo por tandas): "Agrupar" ya no cierra la Hoja — reemplaza a
// "Guardar" y "onConfirmar". El display arranca siempre en "0"; lo ya
// contado se lee en la línea "Tu conteo: N".
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
        partidas={[]}
        onAgrupar={() => {}}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );
    // <dialog> sin abrir no se considera visible.
    expect(screen.queryByText("$5.000")).not.toBeVisible();
  });

  it("el display arranca en 0, nunca precarga valorInicial", () => {
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={12}
        partidas={[]}
        onAgrupar={() => {}}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );

    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
  });

  it("no agrupa una tanda de 0: el segundo toque sobre Agrupar no escribe nada", () => {
    // Camino de PÉRDIDA DE CONTEO, no cosmética. Tras agrupar, el display
    // vuelve a "0"; un segundo toque accidental mandaría una tanda de 0.
    // Como ConteoScreen calcula `cantidad` sumando sobre `miAporteEnEdicion`
    // —una suscripción que resuelve un render DESPUÉS— ese segundo toque,
    // llegando antes del re-render, escribe `0 + 0 = 0` y BORRA la tanda
    // recién agrupada. Una tanda de cero no significa nada de todos modos:
    // el botón no puede dispararla. AGENTS.md §1: el manejo de error que
    // evita perder conteos no se simplifica.
    const onAgrupar = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={50}
        partidas={[{ id: "p1", cantidad: 50 }]}
        onAgrupar={onAgrupar}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );

    const agrupar = screen.getByRole("button", { name: "Agrupar" });
    expect(agrupar).toBeDisabled();
    fireEvent.click(agrupar);
    expect(onAgrupar).not.toHaveBeenCalled();
  });

  it("con un valor tecleado, Agrupar se habilita y emite esa cantidad", () => {
    // Par afirmativo del anterior: sin esto, "el botón está deshabilitado"
    // pasaría igual si estuviera deshabilitado SIEMPRE.
    const onAgrupar = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        partidas={[]}
        onAgrupar={onAgrupar}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "5" }));
    const agrupar = screen.getByRole("button", { name: "Agrupar" });
    expect(agrupar).toBeEnabled();
    fireEvent.click(agrupar);
    expect(onAgrupar).toHaveBeenCalledWith(5);
    // Y vuelve a quedar deshabilitado, listo para la siguiente tanda.
    expect(screen.getByRole("button", { name: "Agrupar" })).toBeDisabled();
  });

  it('"Tu conteo: N" refleja valorInicial, incluso cuando llega un render después de abrir', () => {
    const { rerender } = render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        partidas={[]}
        onAgrupar={() => {}}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );

    expect(screen.getByText("Tu conteo: 0")).toBeInTheDocument();

    // La suscripción real (useMiAporte en ConteoScreen) resuelve un render
    // después de abrir la Hoja: `valorInicial` llega tarde, no en el primer
    // render.
    rerender(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={12}
        partidas={[]}
        onAgrupar={() => {}}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );

    expect(screen.getByText("Tu conteo: 12")).toBeInTheDocument();
    // El display de la tanda en curso no se pisa con lo ya contado.
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
  });

  it('teclear 50 y tocar "Agrupar" llama onAgrupar(50), el display vuelve a 0 y la hoja sigue abierta', () => {
    const onAgrupar = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        partidas={[]}
        onAgrupar={onAgrupar}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "5" }));
    fireEvent.click(screen.getByRole("button", { name: "0" }));
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("50");

    fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));

    expect(onAgrupar).toHaveBeenCalledWith(50);
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
    // Sigue abierta: el diálogo no recibe ninguna orden de cierre.
    expect(screen.getByText("$5.000")).toBeVisible();
  });

  it("borrar dígito quita el último y nunca deja el campo vacío", () => {
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={5}
        partidas={[]}
        onAgrupar={() => {}}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1" }));
    fireEvent.click(screen.getByRole("button", { name: /borrar dígito/i }));
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
    fireEvent.click(screen.getByRole("button", { name: /borrar dígito/i }));
    expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
  });

  it("sin promedioCategoria (prop opcional), agrupa directo sin confirmar", () => {
    const onAgrupar = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        partidas={[]}
        onAgrupar={onAgrupar}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.click(screen.getByRole("button", { name: "9" }));
    fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));

    expect(onAgrupar).toHaveBeenCalledWith(999);
  });

  describe("lista de tandas y papelera (ADR-24)", () => {
    it("lista las tandas recibidas por prop", () => {
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={80}
          partidas={[
            { id: "p1", cantidad: 50 },
            { id: "p2", cantidad: 30 },
          ]}
          onAgrupar={() => {}}
          onBorrarPartida={() => {}}
          onVolver={() => {}}
        />,
      );

      expect(screen.getByText("50")).toBeInTheDocument();
      expect(screen.getByText("30")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Borrar tanda de 50" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Borrar tanda de 30" })).toBeInTheDocument();
    });

    it("sin tandas, no se pinta la lista", () => {
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          partidas={[]}
          onAgrupar={() => {}}
          onBorrarPartida={() => {}}
          onVolver={() => {}}
        />,
      );

      expect(screen.queryByRole("button", { name: /borrar tanda/i })).not.toBeInTheDocument();
    });

    it("la papelera pide confirmación en vez de borrar directo", () => {
      const onBorrarPartida = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={50}
          partidas={[{ id: "p1", cantidad: 50 }]}
          onAgrupar={() => {}}
          onBorrarPartida={onBorrarPartida}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Borrar tanda de 50" }));

      expect(screen.getByText("¿Borrar la tanda de 50?")).toBeInTheDocument();
      expect(onBorrarPartida).not.toHaveBeenCalled();
    });

    it('"Corregir" en la confirmación de borrado NO borra y vuelve a mostrar el teclado', () => {
      const onBorrarPartida = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={50}
          partidas={[{ id: "p1", cantidad: 50 }]}
          onAgrupar={() => {}}
          onBorrarPartida={onBorrarPartida}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Borrar tanda de 50" }));
      fireEvent.click(screen.getByRole("button", { name: /corregir/i }));

      expect(onBorrarPartida).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Borrar tanda de 50" })).toBeInTheDocument();
    });

    it('"Sí, borrar" llama onBorrarPartida con la tanda', () => {
      const onBorrarPartida = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={50}
          partidas={[{ id: "p1", cantidad: 50 }]}
          onAgrupar={() => {}}
          onBorrarPartida={onBorrarPartida}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "Borrar tanda de 50" }));
      fireEvent.click(screen.getByRole("button", { name: /sí, borrar/i }));

      expect(onBorrarPartida).toHaveBeenCalledWith({ id: "p1", cantidad: 50 });
    });
  });

  describe("confirmación suave si la tanda supera 10× el promedio (F4-A1, doc 10 §10)", () => {
    it("tocar Agrupar con una tanda > 10× el promedio pide confirmar en vez de agrupar directo", () => {
      const onAgrupar = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          partidas={[]}
          promedioCategoria={10}
          onAgrupar={onAgrupar}
          onBorrarPartida={() => {}}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));

      expect(onAgrupar).not.toHaveBeenCalled();
      expect(screen.getByText(/mucho más que el promedio/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /sí, guardar/i })).toBeInTheDocument();
    });

    it('"Sí, guardar" en la confirmación sí agrupa la tanda tecleada', () => {
      const onAgrupar = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          partidas={[]}
          promedioCategoria={10}
          onAgrupar={onAgrupar}
          onBorrarPartida={() => {}}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));
      fireEvent.click(screen.getByRole("button", { name: /sí, guardar/i }));

      expect(onAgrupar).toHaveBeenCalledWith(500);
      expect(screen.getByTestId("hoja-valor")).toHaveTextContent("0");
    });

    it('"Corregir" vuelve al teclado sin agrupar ni perder lo tecleado', () => {
      const onAgrupar = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          partidas={[]}
          promedioCategoria={10}
          onAgrupar={onAgrupar}
          onBorrarPartida={() => {}}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));
      fireEvent.click(screen.getByRole("button", { name: /corregir/i }));

      expect(onAgrupar).not.toHaveBeenCalled();
      expect(screen.getByTestId("hoja-valor")).toHaveTextContent("500");
      // El teclado numérico está de vuelta.
      expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    });

    it("una cantidad por debajo del umbral agrupa directo, sin pedir confirmación", () => {
      const onAgrupar = vi.fn();
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          partidas={[]}
          promedioCategoria={10}
          onAgrupar={onAgrupar}
          onBorrarPartida={() => {}}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "8" }));
      fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));

      expect(onAgrupar).toHaveBeenCalledWith(8);
    });

    it("nunca añade un segundo role=alert (restricción de ConteoScreen.test.tsx)", () => {
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          partidas={[]}
          promedioCategoria={10}
          onAgrupar={() => {}}
          onBorrarPartida={() => {}}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("deja el foco en «Corregir» al entrar en la confirmación", () => {
      // El botón "Agrupar" que tenía el foco se DESMONTA al cambiar de
      // vista, así que sin esto el foco cae al <body> y quien navega por
      // teclado tiene que rebuscar dónde quedó dentro del diálogo. Aterriza
      // en "Corregir" y no en "Sí, guardar" a propósito: el foco por
      // defecto no debe estar sobre la acción que confirma un número
      // sospechoso.
      render(
        <Hoja
          abierta={true}
          etiqueta="$5.000"
          valorInicial={0}
          partidas={[]}
          promedioCategoria={10}
          onAgrupar={() => {}}
          onBorrarPartida={() => {}}
          onVolver={() => {}}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "5" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: "0" }));
      fireEvent.click(screen.getByRole("button", { name: /agrupar/i }));

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
        partidas={[]}
        onAgrupar={() => {}}
        onBorrarPartida={() => {}}
        onVolver={onVolver}
      />,
    );
    expect(screen.queryByRole("button", { name: /cerrar|descartar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /volver/i }));
    expect(onVolver).toHaveBeenCalledOnce();
  });

  it('"Volver" es un botón de verdad con objetivo táctil, no texto subrayado', () => {
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        partidas={[]}
        onAgrupar={() => {}}
        onBorrarPartida={() => {}}
        onVolver={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /volver/i })).toHaveClass(
      "min-h-[var(--size-toque)]",
    );
  });

  it("tocar fuera de la hoja (backdrop) la cierra sin agrupar", () => {
    const onVolver = vi.fn();
    const onAgrupar = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        partidas={[]}
        onAgrupar={onAgrupar}
        onBorrarPartida={() => {}}
        onVolver={onVolver}
      />,
    );
    fireEvent.click(screen.getByRole("dialog"));

    expect(onVolver).toHaveBeenCalledTimes(1);
    expect(onAgrupar).not.toHaveBeenCalled();
  });

  it("tocar dentro de la hoja no la cierra (control negativo del backdrop)", () => {
    const onVolver = vi.fn();
    render(
      <Hoja
        abierta={true}
        etiqueta="$5.000"
        valorInicial={0}
        partidas={[]}
        onAgrupar={() => {}}
        onBorrarPartida={() => {}}
        onVolver={onVolver}
      />,
    );
    fireEvent.click(screen.getByText("$5.000"));

    expect(onVolver).not.toHaveBeenCalled();
  });
});
