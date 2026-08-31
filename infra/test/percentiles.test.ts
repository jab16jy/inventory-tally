// Helper puro usado por rnf-01-latencia-sincronizacion.test.ts (issue #62)
// para resumir las muestras de latencia de onSnapshot. Se prueba aparte,
// sin emulador, porque es la única lógica de bifurcación propia que ese
// test de integración necesita (ver cierre del ticket #62 sobre alcance de
// mutation testing).
import { describe, expect, it } from "vitest";
import { resumenLatencias } from "./percentiles.js";

describe("resumenLatencias", () => {
  it("calcula promedio y máximo sobre una muestra sin ordenar", () => {
    const resumen = resumenLatencias([30, 10, 50, 20, 40]);
    expect(resumen.promedio).toBe(30);
    expect(resumen.maximo).toBe(50);
  });

  it("p50 de una muestra impar es el valor central exacto (rango entero)", () => {
    const resumen = resumenLatencias([10, 20, 30, 40, 50]);
    expect(resumen.p50).toBe(30);
  });

  it("interpola cuando el rango del percentil cae entre dos muestras", () => {
    // n=4 → rango p95 = 0.95*3 = 2.85 → entre índices 2 y 3
    const resumen = resumenLatencias([10, 20, 30, 40]);
    expect(resumen.p95).toBeCloseTo(38.5, 5);
  });

  it("con una sola muestra, todos los percentiles son esa muestra", () => {
    const resumen = resumenLatencias([42]);
    expect(resumen).toEqual({ promedio: 42, maximo: 42, p50: 42, p95: 42 });
  });

  it("no depende del orden de entrada", () => {
    const desordenada = resumenLatencias([5, 1, 4, 2, 3]);
    const ordenada = resumenLatencias([1, 2, 3, 4, 5]);
    expect(desordenada).toEqual(ordenada);
  });

  it("rechaza una muestra vacía en vez de devolver NaN silencioso", () => {
    expect(() => resumenLatencias([])).toThrow(/al menos una muestra/);
  });
});
