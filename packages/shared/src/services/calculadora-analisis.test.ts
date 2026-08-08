import { describe, expect, it } from "vitest";
import { distribuirRedondeo, participacion } from "./calculadora-analisis.js";

/** El invariante real de distribuirRedondeo vive en las décimas enteras, NO
 * en la suma en coma flotante de los valores devueltos: `33.4 + 33.3 + 33.3`
 * da `99.99999999999999` en JS por representación binaria, aunque las
 * décimas (334 + 333 + 333) sumen 1000 exacto. Esta es la forma robusta de
 * verificar el invariante para cualquier entrada. */
function sumaEnDecimas(porcentajes: readonly number[]): number {
  return porcentajes.reduce((total, p) => total + Math.round(p * 10), 0);
}

describe("participacion", () => {
  it("calcula el porcentaje de parte sobre total", () => {
    expect(participacion(25, 100)).toBe(25);
  });

  it("participación devuelve 0 cuando el total es 0", () => {
    expect(participacion(5, 0)).toBe(0);
  });
});

describe("distribuirRedondeo", () => {
  it("los porcentajes repartidos suman exactamente 100.0", () => {
    // 1/6, 1/6, 4/6 → sobrante real de 2 décimas (no como [275000, 620000,
    // 105000], donde los floors ya sumaban 1000 y el bucle de reparto no se
    // ejercitaba: ese caso pasaría igual con el método borrado).
    const porcentajes = distribuirRedondeo([1, 1, 4]);
    expect(sumaEnDecimas(porcentajes)).toBe(1000);
  });

  it.each([
    { entrada: [1, 2, 3], caso: "un solo sobrante repartido al mayor resto" },
    {
      entrada: [1, 1, 1],
      caso: "empate exacto — la suma en floats da 99.99999999999999, las décimas SÍ dan 1000",
    },
    {
      entrada: [10, 10, 10, 1],
      caso: "el redondeo ingenuo se pasaría a 100.1; en décimas da 1000 exacto",
    },
    { entrada: [275000, 620000, 105000], caso: "sin sobrante (floors ya suman 1000)" },
  ])("el invariante de décimas se sostiene para cualquier reparto — $caso", ({ entrada }) => {
    expect(sumaEnDecimas(distribuirRedondeo(entrada))).toBe(1000);
  });

  it("asigna el sobrante al mayor resto", () => {
    // 1/6, 2/6, 3/6 → 16.6667%, 33.3333%, 50.0000%. Al truncar a un decimal
    // sobra 1 décima (99.9 → falta 0.1) y se le asigna al mayor resto: el
    // índice 0 (0.667), no al valor más grande (índice 2, resto exacto 0).
    expect(distribuirRedondeo([1, 2, 3])).toEqual([16.7, 33.3, 50]);
  });

  it("participación devuelve 0 cuando el total es 0 (distribuirRedondeo con todos los valores en 0)", () => {
    expect(distribuirRedondeo([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it("entrada vacía devuelve arreglo vacío", () => {
    expect(distribuirRedondeo([])).toEqual([]);
  });

  it("una sola entrada recibe 100.0", () => {
    expect(distribuirRedondeo([42])).toEqual([100]);
  });

  it("valores iguales reparten el sobrante por índice más bajo (empate determinístico)", () => {
    // 1/3 exacto → 33.3333...% cada uno: truncado da 33.3 x3 = 99.9, sobra 1
    // décima que va al primer índice empatado, nunca al azar ni al último.
    expect(distribuirRedondeo([1, 1, 1])).toEqual([33.4, 33.3, 33.3]);
  });

  it("el redondeo ingenuo por elemento NO sumaría 100.0 (aquí se pasa por exceso a 100.1)", () => {
    // 10/31, 10/31, 10/31, 1/31 → 32.2581%, 32.2581%, 32.2581%, 3.2258%.
    // Redondeado ingenuamente elemento a elemento: 32.3+32.3+32.3+3.2 = 100.1
    // (verificado a mano). El método del mayor resto reparte el único
    // sobrante entre los dos primeros empatados y da exactamente 100.0.
    expect(distribuirRedondeo([10, 10, 10, 1])).toEqual([32.3, 32.3, 32.2, 3.2]);
  });
});
