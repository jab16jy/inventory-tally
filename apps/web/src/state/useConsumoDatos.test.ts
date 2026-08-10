// apps/web/src/state/useConsumoDatos.test.ts — issue #20 item 2, doc 11 §24.
import { renderHook } from "@testing-library/react";
import type { LineaConteo } from "@conteo/shared";
import { describe, expect, it } from "vitest";
import { useConsumoDatos } from "./useConsumoDatos.js";

function lineaBase(categoriaId: string): LineaConteo {
  return {
    categoriaId,
    valorUnitario: 1000,
    etiqueta: `$${categoriaId}`,
    cantidadTotal: 0,
    numAportantes: 0,
    versiones: {},
    actualizadaEn: new Date(),
    actualizadaPor: "",
  };
}

describe("useConsumoDatos (issue #20 item 2)", () => {
  it("empieza en 0 con la lista vacía", () => {
    const { result } = renderHook(() => useConsumoDatos([]));
    expect(result.current).toBe(0);
  });

  it("acumula al recibir una nueva emisión del listener, nunca baja", () => {
    const { result, rerender } = renderHook(({ lineas }) => useConsumoDatos(lineas), {
      initialProps: { lineas: [lineaBase("a"), lineaBase("b")] as readonly LineaConteo[] },
    });
    const primero = result.current;
    expect(primero).toBeGreaterThan(0);

    // Nueva identidad de array (como emite un onSnapshot real), misma cantidad
    // de líneas: el total SUMA de nuevo, no se queda igual.
    rerender({ lineas: [lineaBase("a"), lineaBase("b")] });
    expect(result.current).toBe(primero * 2);
  });
});
