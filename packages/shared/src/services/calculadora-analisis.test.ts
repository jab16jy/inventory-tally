import { describe, expect, it } from "vitest";
import {
  agruparPorDimension,
  diasEntre,
  distribuirRedondeo,
  estaAtrasada,
  medianaIntervaloDias,
  participacion,
  variacion,
  type FilaDimension,
  type LineaAgrupable,
} from "./calculadora-analisis.js";

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

/** Fecha en medianoche UTC, para que los tests no dependan de la zona
 * horaria de quien los corre. */
function fecha(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("diasEntre", () => {
  it("la misma fecha da 0 días", () => {
    expect(diasEntre(fecha("2026-01-01"), fecha("2026-01-01"))).toBe(0);
  });

  it("un día exacto de diferencia da 1", () => {
    expect(diasEntre(fecha("2026-01-01"), fecha("2026-01-02"))).toBe(1);
  });

  it("trunca, no redondea: un día completo más unas horas sigue dando 1", () => {
    // 2026-01-02T12:00:00Z: un día y medio después de fecha("2026-01-01").
    // Redondear daría 2; truncar (días *completos* transcurridos) da 1 — no
    // se cumplió un segundo día entero todavía.
    const hasta = new Date("2026-01-02T12:00:00.000Z");
    expect(diasEntre(fecha("2026-01-01"), hasta)).toBe(1);
  });

  it("23 horas y 59 minutos NO llegan a completar un día: da 0, no 1", () => {
    const hasta = new Date("2026-01-01T23:59:00.000Z");
    expect(diasEntre(fecha("2026-01-01"), hasta)).toBe(0);
  });

  it("varios días exactos de diferencia", () => {
    expect(diasEntre(fecha("2026-01-01"), fecha("2026-01-15"))).toBe(14);
  });
});

describe("medianaIntervaloDias", () => {
  it("cero cierres devuelve null: sin historial no hay cadencia que incumplir", () => {
    expect(medianaIntervaloDias([])).toBeNull();
  });

  it("un solo cierre devuelve null: un punto no define un intervalo", () => {
    expect(medianaIntervaloDias([fecha("2026-01-01")])).toBeNull();
  });

  it("dos cierres devuelve el único intervalo entre ellos", () => {
    expect(medianaIntervaloDias([fecha("2026-01-01"), fecha("2026-01-11")])).toBe(10);
  });

  it("número impar de intervalos devuelve el intervalo central", () => {
    // Cierres cada 10, 20, 30 días → intervalos [10, 20, 30], central 20.
    const cierres = [
      fecha("2026-01-01"),
      fecha("2026-01-11"),
      fecha("2026-01-31"),
      fecha("2026-03-02"),
    ];
    expect(medianaIntervaloDias(cierres)).toBe(20);
  });

  it("número par de intervalos promedia los dos centrales", () => {
    // Cierres separados por 10, 20, 30, 40 días → intervalos [10, 20, 30, 40],
    // centrales 20 y 30 → mediana 25.
    const cierres = [
      fecha("2026-01-01"),
      fecha("2026-01-11"),
      fecha("2026-01-31"),
      fecha("2026-03-02"),
      fecha("2026-04-11"),
    ];
    expect(medianaIntervaloDias(cierres)).toBe(25);
  });

  it("los intervalos se ordenan por magnitud antes de tomar el central, no por orden cronológico", () => {
    // Cadencia irregular: +30, +5, +15 días entre cierres consecutivos — el
    // orden cronológico de los intervalos no coincide con su orden de
    // magnitud. Sin ordenar los intervalos antes de tomar el central, la
    // mediana saldría mal (5, el primer intervalo cronológico, en vez de 15).
    const cierres = [
      fecha("2026-01-01"),
      fecha("2026-01-31"), // +30
      fecha("2026-02-05"), // +5
      fecha("2026-02-20"), // +15
    ];
    expect(medianaIntervaloDias(cierres)).toBe(15);
  });

  it("no asume orden: una entrada desordenada da el mismo resultado que ordenada", () => {
    const ordenadas = [
      fecha("2026-01-01"),
      fecha("2026-01-11"),
      fecha("2026-01-31"),
      fecha("2026-03-02"),
    ];
    const desordenadas = [ordenadas[2]!, ordenadas[0]!, ordenadas[3]!, ordenadas[1]!];
    expect(medianaIntervaloDias(desordenadas)).toBe(medianaIntervaloDias(ordenadas));
  });
});

describe("estaAtrasada", () => {
  it("sin mediana (sin historial) nunca está atrasada: no se marca lo que no se puede juzgar", () => {
    expect(estaAtrasada(999, null)).toBe(false);
  });

  it("justo en el umbral NO está atrasada: cumplir la cadencia habitual es estar al día, no tarde", () => {
    expect(estaAtrasada(15, 15)).toBe(false);
  });

  it("por debajo del umbral no está atrasada", () => {
    expect(estaAtrasada(10, 15)).toBe(false);
  });

  it("por encima del umbral sí está atrasada", () => {
    expect(estaAtrasada(16, 15)).toBe(true);
  });

  it("auto-calibrado: la misma cantidad de días sin contar es atrasada para una sucursal quincenal pero no para una mensual", () => {
    // Sucursal quincenal: cierra cada ~15 días.
    const cierresQuincenal = [
      fecha("2026-01-01"),
      fecha("2026-01-16"),
      fecha("2026-01-31"),
      fecha("2026-02-15"),
    ];
    // Sucursal mensual: cierra cada ~30 días.
    const cierresMensual = [
      fecha("2026-01-01"),
      fecha("2026-01-31"),
      fecha("2026-03-02"),
      fecha("2026-04-01"),
    ];

    const medianaQuincenal = medianaIntervaloDias(cierresQuincenal);
    const medianaMensual = medianaIntervaloDias(cierresMensual);
    const diasSinContar = 20;

    expect(estaAtrasada(diasSinContar, medianaQuincenal)).toBe(true);
    expect(estaAtrasada(diasSinContar, medianaMensual)).toBe(false);
  });
});

function crearLineaAgrupable(overrides: Partial<LineaAgrupable> = {}): LineaAgrupable {
  return {
    categoriaId: "cat-1",
    etiqueta: "línea",
    area: "área",
    cantidadTotal: 1,
    valorUnitario: 1,
    ...overrides,
  };
}

describe("agruparPorDimension", () => {
  const sumaUnidades = (filas: readonly FilaDimension[]) =>
    filas.reduce((total, f) => total + f.unidades, 0);
  const sumaValor = (filas: readonly FilaDimension[]) =>
    filas.reduce((total, f) => total + f.valor, 0);

  it("las tres dimensiones dan el mismo total de unidades y de dinero sobre el mismo conjunto de líneas", () => {
    const lineas: LineaAgrupable[] = [
      crearLineaAgrupable({
        categoriaId: "cat-a",
        etiqueta: "Categoría A",
        area: "Barra",
        cantidadTotal: 10,
        valorUnitario: 5,
        aplicados: { uid1: 6, uid2: 4 },
      }),
      crearLineaAgrupable({
        categoriaId: "cat-b",
        etiqueta: "Categoría B",
        area: "Cocina",
        cantidadTotal: 20,
        valorUnitario: 2,
        aplicados: { uid1: 20 },
      }),
    ];

    const porCategoria = agruparPorDimension(lineas, "categoria");
    const porArea = agruparPorDimension(lineas, "area");
    const porCajero = agruparPorDimension(lineas, "cajero");

    expect(sumaUnidades(porCategoria)).toBe(30);
    expect(sumaUnidades(porArea)).toBe(30);
    expect(sumaUnidades(porCajero)).toBe(30);
    expect(sumaValor(porCategoria)).toBe(90); // 10*5 + 20*2
    expect(sumaValor(porArea)).toBe(90);
    expect(sumaValor(porCajero)).toBe(90);
  });

  it("cajero reparte el dinero proporcional a las unidades de cada aportante, nunca en partes iguales", () => {
    // uidA aportó 8 de 10 unidades, uidB sólo 2 — dividir el subtotal (100) en
    // partes iguales (50/50) atribuiría dinero que ninguno de los dos aportó.
    const linea = crearLineaAgrupable({
      cantidadTotal: 10,
      valorUnitario: 10,
      aplicados: { uidA: 8, uidB: 2 },
    });
    const filas = agruparPorDimension([linea], "cajero");
    const filaA = filas.find((f) => f.clave === "uidA");
    const filaB = filas.find((f) => f.clave === "uidB");
    expect(filaA?.valor).toBe(80);
    expect(filaB?.valor).toBe(20);
  });

  it("un uid sin entrada en nombres cae al propio uid, nunca a cadena vacía", () => {
    const linea = crearLineaAgrupable({ cantidadTotal: 3, aplicados: { "uid-sin-nombre": 3 } });
    const filas = agruparPorDimension([linea], "cajero", new Map([["otro-uid", "Otro"]]));
    expect(filas[0]?.etiqueta).toBe("uid-sin-nombre");
    expect(filas[0]?.etiqueta).not.toBe("");
  });

  it("aplicados ausente en la línea no revienta", () => {
    const linea = crearLineaAgrupable({ cantidadTotal: 0, valorUnitario: 5, aplicados: undefined });
    expect(agruparPorDimension([linea], "cajero")).toEqual([]);
  });

  // El caso de arriba usa cantidadTotal 0, así que pasaría igual con el guard
  // roto: no demuestra nada por sí solo (AGENTS.md §2). Éste es su par
  // afirmativo — una línea de sesión vieja, contada pero sin el mapa
  // `aplicados`, tiene que volcarse ENTERA en "Sin atribuir" en vez de
  // desaparecer del desglose y hacer que la tabla muestre menos dinero del
  // que hay.
  it("una línea contada sin aplicados vuelca todas sus unidades en «Sin atribuir»", () => {
    const linea = crearLineaAgrupable({ cantidadTotal: 7, valorUnitario: 5, aplicados: undefined });
    expect(agruparPorDimension([linea], "cajero")).toEqual([
      { clave: "__sin_atribuir", etiqueta: "Sin atribuir", unidades: 7, valor: 35 },
    ]);
  });

  it("cuando la suma de aplicados es menor que cantidadTotal aparece la fila «Sin atribuir» y el total sigue cuadrando", () => {
    const linea = crearLineaAgrupable({
      cantidadTotal: 10,
      valorUnitario: 3,
      aplicados: { uidA: 7 },
    });
    const filas = agruparPorDimension([linea], "cajero");
    const sinAtribuir = filas.find((f) => f.clave === "__sin_atribuir");
    expect(sinAtribuir?.etiqueta).toBe("Sin atribuir");
    expect(sinAtribuir?.unidades).toBe(3);
    expect(sinAtribuir?.valor).toBe(9);
    expect(sumaUnidades(filas)).toBe(10);
    expect(sumaValor(filas)).toBe(30);
  });

  it("una línea con area vacía cae en «Sin área» (mismo rótulo que abrir-sesion.ts)", () => {
    const linea = crearLineaAgrupable({ area: "", cantidadTotal: 4, valorUnitario: 2 });
    const filas = agruparPorDimension([linea], "area");
    expect(filas).toEqual([{ clave: "Sin área", etiqueta: "Sin área", unidades: 4, valor: 8 }]);
  });

  it("ordena por valor descendente y desempata por etiqueta ascendente, de forma determinística", () => {
    const lineas = [
      crearLineaAgrupable({
        categoriaId: "z",
        etiqueta: "Zeta",
        cantidadTotal: 5,
        valorUnitario: 2,
      }), // 10
      crearLineaAgrupable({
        categoriaId: "a",
        etiqueta: "Alfa",
        cantidadTotal: 10,
        valorUnitario: 1,
      }), // 10
      crearLineaAgrupable({
        categoriaId: "m",
        etiqueta: "Media",
        cantidadTotal: 100,
        valorUnitario: 1,
      }), // 100
    ];
    const filas = agruparPorDimension(lineas, "categoria");
    expect(filas.map((f) => f.etiqueta)).toEqual(["Media", "Alfa", "Zeta"]);
  });

  it("lineas vacío devuelve arreglo vacío en las tres dimensiones", () => {
    expect(agruparPorDimension([], "categoria")).toEqual([]);
    expect(agruparPorDimension([], "area")).toEqual([]);
    expect(agruparPorDimension([], "cajero")).toEqual([]);
  });
});

describe("variacion", () => {
  it("crecimiento devuelve el porcentaje positivo", () => {
    expect(variacion(150, 100)).toBe(50);
  });

  it("decrecimiento devuelve el porcentaje negativo", () => {
    expect(variacion(80, 100)).toBe(-20);
  });

  it("sin cambio devuelve 0", () => {
    expect(variacion(100, 100)).toBe(0);
  });

  it("anterior en 0 devuelve null: crecer desde cero no tiene porcentaje", () => {
    expect(variacion(50, 0)).toBeNull();
  });
});
