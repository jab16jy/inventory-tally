import { describe, expect, it } from "vitest";
import {
  agruparConOtros,
  distribuirRedondeo,
  extremosPorSubtotal,
  participacion,
  type PorcionAnalisis,
} from "./calculadora-analisis.js";
import type { LineaSumable } from "./calculadora.js";

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

interface LineaDePrueba extends LineaSumable {
  readonly etiqueta: string;
}

function crearLineaPrueba(overrides: Partial<LineaDePrueba> = {}): LineaDePrueba {
  return {
    etiqueta: "línea",
    cantidadTotal: 1,
    valorUnitario: 1,
    ...overrides,
  };
}

describe("extremosPorSubtotal", () => {
  it("ignora las líneas sin contar (cantidadTotal 0) aunque tengan el valorUnitario más alto", () => {
    // Una implementación que no filtre por cantidadTotal calcularía el
    // subtotal de "sin-contar" como 0 (0 * 999) y lo elegiría como "menor"
    // en vez de la línea realmente más barata entre las contadas.
    const sinContar = crearLineaPrueba({
      etiqueta: "sin-contar",
      cantidadTotal: 0,
      valorUnitario: 999,
    });
    const barata = crearLineaPrueba({ etiqueta: "barata", cantidadTotal: 5, valorUnitario: 10 }); // subtotal 50
    const cara = crearLineaPrueba({ etiqueta: "cara", cantidadTotal: 3, valorUnitario: 100 }); // subtotal 300

    const extremos = extremosPorSubtotal([sinContar, barata, cara]);

    expect(extremos?.mayor.etiqueta).toBe("cara");
    expect(extremos?.menor.etiqueta).toBe("barata");
  });

  it("una sola línea contada es a la vez mayor y menor", () => {
    const unica = crearLineaPrueba({ etiqueta: "única", cantidadTotal: 4, valorUnitario: 25 });
    const extremos = extremosPorSubtotal([unica]);
    expect(extremos?.mayor.etiqueta).toBe("única");
    expect(extremos?.menor.etiqueta).toBe("única");
  });

  it("devuelve null cuando ninguna línea está contada", () => {
    const lineas = [
      crearLineaPrueba({ etiqueta: "a", cantidadTotal: 0 }),
      crearLineaPrueba({ etiqueta: "b", cantidadTotal: 0 }),
    ];
    expect(extremosPorSubtotal(lineas)).toBeNull();
  });

  it("un empate en el subtotal resuelve al índice más bajo, tanto para mayor como para menor", () => {
    const lineas = [
      crearLineaPrueba({ etiqueta: "primera-alta", cantidadTotal: 10, valorUnitario: 10 }), // 100
      crearLineaPrueba({ etiqueta: "primera-baja", cantidadTotal: 5, valorUnitario: 10 }), // 50
      crearLineaPrueba({ etiqueta: "segunda-alta", cantidadTotal: 20, valorUnitario: 5 }), // 100, empata
      crearLineaPrueba({ etiqueta: "segunda-baja", cantidadTotal: 10, valorUnitario: 5 }), // 50, empata
    ];
    const extremos = extremosPorSubtotal(lineas);
    expect(extremos?.mayor.etiqueta).toBe("primera-alta");
    expect(extremos?.menor.etiqueta).toBe("primera-baja");
  });
});

describe("agruparConOtros", () => {
  function porcion(etiqueta: string, monto: number): PorcionAnalisis {
    return { etiqueta, monto };
  }

  it("con menos porciones que el máximo, devuelve todas ordenadas sin fila «Otros»", () => {
    const porciones = [porcion("b", 20), porcion("a", 30)];
    expect(agruparConOtros(porciones, 5)).toEqual([porcion("a", 30), porcion("b", 20)]);
  });

  it("con exactamente el máximo de porciones, no agrupa (doblar 1 en «Otros» sería peor que nombrarla)", () => {
    const porciones = [porcion("a", 30), porcion("b", 20), porcion("c", 10)];
    const resultado = agruparConOtros(porciones, 3);
    expect(resultado).toEqual([porcion("a", 30), porcion("b", 20), porcion("c", 10)]);
    expect(resultado.some((p) => p.etiqueta === "Otros")).toBe(false);
  });

  it("con un elemento más que el máximo, agrupa la cola en «Otros» al final", () => {
    const porciones = [porcion("a", 40), porcion("b", 30), porcion("c", 20), porcion("d", 10)];
    const resultado = agruparConOtros(porciones, 3);
    expect(resultado).toEqual([porcion("a", 40), porcion("b", 30), porcion("Otros", 30)]);
    expect(resultado).toHaveLength(3);
  });

  it("descarta las porciones en 0 antes de agrupar (no dibujan arco ni deben aparecer)", () => {
    const porciones = [porcion("a", 30), porcion("cero", 0), porcion("b", 20)];
    const resultado = agruparConOtros(porciones, 5);
    expect(resultado).toEqual([porcion("a", 30), porcion("b", 20)]);
    expect(resultado.some((p) => p.monto === 0)).toBe(false);
  });

  it("un empate en monto resuelve al índice original más bajo (orden estable, sin agrupar)", () => {
    // Si la implementación desempatara alfabéticamente por etiqueta, "z"
    // quedaría después de "a"; el criterio correcto es el índice original.
    const porciones = [porcion("z", 50), porcion("a", 50)];
    expect(agruparConOtros(porciones, 5)).toEqual([porcion("z", 50), porcion("a", 50)]);
  });

  it("un empate en monto en el borde del recorte resuelve al índice original más bajo dentro de «Otros»", () => {
    const porciones = [porcion("a", 100), porcion("b", 100), porcion("c", 50)];
    const resultado = agruparConOtros(porciones, 2);
    // "a" y "b" empatan en 100: gana el índice más bajo ("a" queda nombrada),
    // "b" se pliega dentro de "Otros" junto con "c".
    expect(resultado).toEqual([porcion("a", 100), porcion("Otros", 150)]);
  });

  it("con maximo menor a 1 no devuelve basura: arreglo vacío", () => {
    expect(agruparConOtros([porcion("a", 10)], 0)).toEqual([]);
  });
});
