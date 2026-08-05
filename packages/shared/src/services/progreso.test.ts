import { describe, expect, it } from "vitest";
import type { LineaConteo } from "../models/linea-conteo.js";
import { estaPendiente, siguientePendiente } from "./progreso.js";

function linea(categoriaId: string, versiones: Record<string, number>): LineaConteo {
  return {
    categoriaId,
    valorUnitario: 5000,
    etiqueta: `$${categoriaId}`,
    cantidadTotal: 0,
    numAportantes: 0,
    versiones,
    actualizadaEn: new Date(),
    actualizadaPor: "",
  };
}

describe("estaPendiente (doc 10 §2 — fuente única para progreso, filtro y avance)", () => {
  it("sin versión propia en la línea, está pendiente", () => {
    expect(estaPendiente(linea("cat_1", {}), "uid_ana")).toBe(true);
  });

  it("con versión propia registrada, ya no está pendiente", () => {
    expect(estaPendiente(linea("cat_1", { uid_ana: 1 }), "uid_ana")).toBe(false);
  });

  it("la versión de otro cajero no cuenta para el uid actual", () => {
    expect(estaPendiente(linea("cat_1", { uid_beto: 3 }), "uid_ana")).toBe(true);
  });
});

describe("siguientePendiente", () => {
  const lineas = [
    linea("cat_1", { uid_ana: 1 }), // ya contada
    linea("cat_2", {}), // pendiente
    linea("cat_3", {}), // pendiente
    linea("cat_4", { uid_ana: 1 }), // ya contada
  ];

  it("devuelve la siguiente pendiente en el orden de las líneas", () => {
    expect(siguientePendiente(lineas, "uid_ana", "cat_1")).toBe("cat_2");
  });

  it("salta las ya contadas hasta encontrar la próxima pendiente", () => {
    expect(siguientePendiente(lineas, "uid_ana", "cat_2")).toBe("cat_3");
  });

  it("da la vuelta al principio si no hay más pendientes después de la actual", () => {
    const conUnaSolaAlPrincipio = [
      linea("cat_1", {}), // pendiente, antes de la actual
      linea("cat_2", { uid_ana: 1 }),
      linea("cat_3", { uid_ana: 1 }), // actual
    ];
    expect(siguientePendiente(conUnaSolaAlPrincipio, "uid_ana", "cat_3")).toBe("cat_1");
  });

  it("nunca vuelve a ofrecer la actual, aunque su versión todavía no haya alcanzado al servidor", () => {
    // Caso real: el trigger del backend todavía no agregó la categoría que
    // el cajero acaba de guardar (doc 07 §8) — no debe reabrirse a sí misma.
    const soloLaActualPendiente = [linea("cat_1", { uid_ana: 1 }), linea("cat_2", {})];
    expect(siguientePendiente(soloLaActualPendiente, "uid_ana", "cat_2")).toBeNull();
  });

  it("null cuando no queda ninguna otra categoría pendiente", () => {
    const todasContadas = [linea("cat_1", { uid_ana: 1 }), linea("cat_2", { uid_ana: 1 })];
    expect(siguientePendiente(todasContadas, "uid_ana", "cat_1")).toBeNull();
  });
});
